
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/backendClient';

export interface KYCDocument {
  id: string;
  documentType: 'id_front' | 'id_back' | 'proof_address' | 'selfie';
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
}

export interface VerificationStatus {
  isVerified: boolean;
  documents: KYCDocument[];
  verificationLevel: 'none' | 'basic' | 'full';
  rejectionReason?: string;
}

export const useVerification = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<VerificationStatus>({
    isVerified: false,
    documents: [],
    verificationLevel: 'none',
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Load documents from backend
  const loadDocuments = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      console.log('📄 A carregar documentos do utilizador:', user.id);

      const data = await apiFetch('/kyc/documents', { method: 'GET' });

      const backendDocs = data.documents || [];

      if (backendDocs && backendDocs.length > 0) {
        console.log('✅ Documentos encontrados:', backendDocs.length);

        const docs: KYCDocument[] = backendDocs.map((doc: any) => ({
          id: doc.id,
          documentType: doc.document_type,
          fileName: doc.file_name,
          fileUrl: doc.file_url,
          uploadedAt: doc.uploaded_at,
          status: doc.status || 'pending',
          rejectionReason: doc.rejection_reason,
        }));

        const isVerified = docs.every((d) => d.status === 'approved');
        const verificationLevel = isVerified
          ? 'full'
          : docs.length > 0
          ? 'basic'
          : 'none';

        setStatus({
          isVerified,
          documents: docs,
          verificationLevel,
        });
      } else {
        console.log('ℹ️ Nenhum documento encontrado');
        setStatus({
          isVerified: false,
          documents: [],
          verificationLevel: 'none',
        });
      }
    } catch (error) {
      console.error('❌ Erro ao carregar documentos:', error);
      setStatus({
        isVerified: false,
        documents: [],
        verificationLevel: 'none',
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Upload a single document
  const uploadDocument = async (
    file: File,
    documentType: KYCDocument['documentType'],
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      console.error('❌ Utilizador não autenticado');
      return { success: false, error: 'Utilizador não autenticado' };
    }

    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: 'Ficheiro muito grande. Máximo 10MB.' };
    }

    setUploading(true);
    console.log('📤 A iniciar upload do documento:', documentType, file.name);

    try {
      // Verificar se já existe um documento deste tipo e remover
      const existingDoc = status.documents.find((d) => d.documentType === documentType);
      if (existingDoc) {
        console.log('🗑️ A remover documento anterior:', existingDoc.id);
        try {
          await apiFetch(`/kyc/documents/${existingDoc.id}`, { method: 'DELETE' });
        } catch (deleteError) {
          console.warn('⚠️ Erro ao remover documento anterior:', deleteError);
        }
      }

      // Criar nome único para o ficheiro
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${user.id}/${documentType}_${timestamp}_${sanitizedFileName}`;

      console.log('📁 A converter ficheiro para base64:', storagePath);

      const fileData: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const data = await apiFetch('/kyc/documents', {
        method: 'POST',
        body: JSON.stringify({
          documentType,
          fileName: file.name,
          fileData,
        }),
      });

      console.log('✅ Documento registado na base de dados:', data.document);

      // Recarregar documentos
      await loadDocuments();

      return { success: true };
    } catch (error: any) {
      console.error('❌ Erro geral no upload:', error);
      return {
        success: false,
        error: error.message || 'Erro ao carregar documento. Tente novamente.',
      };
    } finally {
      setUploading(false);
    }
  };

  // Remove a specific document
  const removeDocument = async (documentType: KYCDocument['documentType']): Promise<void> => {
    if (!user) return;

    try {
      const doc = status.documents.find((d) => d.documentType === documentType);
      if (doc) {
        console.log('🗑️ A remover documento:', doc.id);
        await apiFetch(`/kyc/documents/${doc.id}`, { method: 'DELETE' });
      }

      await loadDocuments();
    } catch (error) {
      console.error('❌ Erro ao remover documento:', error);
    }
  };

  // Calculate progress percentage
  const getProgressPercentage = useCallback((): number => {
    const requiredDocs: KYCDocument['documentType'][] = [
      'id_front',
      'id_back',
      'proof_address',
      'selfie',
    ];
    
    const completedDocs = requiredDocs.filter((type) =>
      status.documents.some((doc) => doc.documentType === type)
    );
    
    return (completedDocs.length / requiredDocs.length) * 100;
  }, [status.documents]);

  // Get current step
  const getCurrentStep = useCallback((): number => {
    const docTypes: KYCDocument['documentType'][] = [
      'id_front',
      'id_back',
      'proof_address',
      'selfie',
    ];
    
    for (let i = 0; i < docTypes.length; i++) {
      const hasDoc = status.documents.some((doc) => doc.documentType === docTypes[i]);
      if (!hasDoc) {
        return i;
      }
    }
    
    return docTypes.length;
  }, [status.documents]);

  // Determinar status KYC
  const kycStatus = status.isVerified 
    ? { status: 'verified' as const } 
    : status.documents.some(d => d.status === 'pending') 
      ? { status: 'pending' as const } 
      : status.documents.some(d => d.status === 'rejected') 
        ? { status: 'rejected' as const } 
        : null;

  return {
    kycStatus,
    documents: status.documents,
    status,
    loading,
    uploading,
    uploadDocument,
    removeDocument,
    refreshStatus: loadDocuments,
    getProgressPercentage,
    getCurrentStep,
  };
};
