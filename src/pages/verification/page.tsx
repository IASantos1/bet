import { useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useVerification } from '../../hooks/useVerification';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';

const VerificationPage = () => {
  const { user: _user } = useAuth();
  const { kycStatus, documents, uploading, uploadDocument, getProgressPercentage, getCurrentStep } = useVerification();
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({
    id_front: null,
    id_back: null,
    proof_address: null,
    selfie: null,
  });

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
    documentType: 'id_front' | 'id_back' | 'proof_address' | 'selfie'
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Criar preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrls((prev) => ({
        ...prev,
        [documentType]: reader.result as string,
      }));
    };
    reader.readAsDataURL(file);

    // Enviar imediatamente para análise
    const result = await uploadDocument(file, documentType);
    
    if (!result.success) {
      alert(result.error || 'Erro ao enviar documento');
      // Remove preview em caso de erro
      setPreviewUrls((prev) => {
        const newPreviews = { ...prev };
        delete newPreviews[documentType];
        return newPreviews;
      });
    }
  };

  const getStatusBadge = () => {
    if (!kycStatus) {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg">
          <i className="ri-error-warning-fill text-gray-400 text-xl"></i>
          <span className="text-gray-400 font-semibold">Não Verificado</span>
        </div>
      );
    }

    switch (kycStatus.status) {
      case 'verified':
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 border border-green-500 rounded-lg">
            <i className="ri-checkbox-circle-fill text-green-500 text-xl"></i>
            <span className="text-green-500 font-semibold">Verificado</span>
          </div>
        );
      case 'pending':
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500 rounded-lg">
            <i className="ri-time-fill text-amber-500 text-xl"></i>
            <span className="text-amber-500 font-semibold">Em Análise</span>
          </div>
        );
      case 'rejected':
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500 rounded-lg">
            <i className="ri-close-circle-fill text-red-500 text-xl"></i>
            <span className="text-red-500 font-semibold">Rejeitado</span>
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg">
            <i className="ri-error-warning-fill text-gray-400 text-xl"></i>
            <span className="text-gray-400 font-semibold">Não Verificado</span>
          </div>
        );
    }
  };

  const getDocumentStatus = (docType: string) => {
    const doc = documents.find((d) => d.documentType === docType);
    
    if (!doc) return null;

    switch (doc.status) {
      case 'approved':
        return <i className="ri-checkbox-circle-fill text-green-500 text-2xl"></i>;
      case 'pending':
        return <i className="ri-time-fill text-amber-500 text-2xl"></i>;
      case 'rejected':
        return <i className="ri-close-circle-fill text-red-500 text-2xl"></i>;
      default:
        return null;
    }
  };

  const DocumentUploadCard = ({
    title,
    description,
    icon,
    documentType,
    step,
  }: {
    title: string;
    description: string;
    icon: string;
    documentType: 'id_front' | 'id_back' | 'proof_address' | 'selfie';
    step: number;
  }) => {
    const doc = documents.find((d) => d.documentType === documentType);
    const isUploaded = doc?.status === 'pending' || doc?.status === 'approved';
    const hasPreview = previewUrls[documentType] || doc?.fileUrl;

    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-500/20 rounded-lg flex items-center justify-center">
              <i className={`${icon} text-amber-500 text-2xl`}></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-semibold">{title}</h3>
                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                  Passo {step}
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-1">{description}</p>
            </div>
          </div>
          {getDocumentStatus(documentType)}
        </div>

        {doc?.status === 'rejected' && doc.rejectionReason && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">
              <i className="ri-error-warning-line mr-2"></i>
              {doc.rejectionReason}
            </p>
          </div>
        )}

        {hasPreview && (
          <div className="mb-4">
            <img
              src={previewUrls[documentType] || doc?.fileUrl}
              alt="Preview"
              className="w-full h-48 object-cover rounded-lg"
            />
          </div>
        )}

        <input
          ref={(el) => {
            fileInputRefs.current[documentType] = el;
          }}
          type="file"
          accept="image/jpeg,image/jpg,image/png,application/pdf"
          onChange={(e) => handleFileSelect(e, documentType)}
          className="hidden"
        />

        <button
          onClick={() => fileInputRefs.current[documentType]?.click()}
          disabled={uploading || (isUploaded && doc?.status === 'pending')}
          className={`w-full py-3 rounded-lg font-semibold transition-all ${
            uploading
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : isUploaded && doc?.status === 'pending'
              ? 'bg-amber-500/20 text-amber-500 border border-amber-500 cursor-not-allowed'
              : isUploaded && doc?.status === 'approved'
              ? 'bg-green-500/20 text-green-500 border border-green-500 hover:bg-green-500/30'
              : doc?.status === 'rejected'
              ? 'bg-amber-500 text-gray-900 hover:bg-amber-400'
              : 'bg-amber-500 text-gray-900 hover:bg-amber-400'
          }`}
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <i className="ri-loader-4-line animate-spin"></i>
              A enviar...
            </span>
          ) : isUploaded && doc?.status === 'pending' ? (
            <span className="flex items-center justify-center gap-2">
              <i className="ri-time-line"></i>
              Em análise
            </span>
          ) : isUploaded && doc?.status === 'approved' ? (
            <span className="flex items-center justify-center gap-2">
              <i className="ri-checkbox-circle-line"></i>
              Aprovado - Carregar novo
            </span>
          ) : doc?.status === 'rejected' ? (
            <span className="flex items-center justify-center gap-2">
              <i className="ri-download-2-line"></i>
              Carregar novamente
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <i className="ri-download-2-line"></i>
              Carregar documento
            </span>
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Header />

      <main className="flex-1 pt-20 pb-24 lg:pb-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-white">Verificação de Identidade</h1>
              {getStatusBadge()}
            </div>
            <p className="text-gray-400">
              Para garantir a segurança da sua conta e cumprir regulamentos, precisamos verificar a sua identidade.
            </p>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 mb-8 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-semibold">Progresso da Verificação</span>
              <span className="text-amber-500 font-bold">{Math.round(getProgressPercentage())}%</span>
            </div>
            <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-4 text-sm">
              <div className={`flex items-center gap-2 ${getCurrentStep() >= 1 ? 'text-amber-500' : 'text-gray-500'}`}>
                <i className="ri-file-text-line"></i>
                <span>Documento ID</span>
              </div>
              <div className={`flex items-center gap-2 ${getCurrentStep() >= 3 ? 'text-amber-500' : 'text-gray-500'}`}>
                <i className="ri-home-line"></i>
                <span>Morada</span>
              </div>
              <div className={`flex items-center gap-2 ${getCurrentStep() >= 4 ? 'text-amber-500' : 'text-gray-500'}`}>
                <i className="ri-user-smile-line"></i>
                <span>Selfie</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-8">
            <div className="flex gap-3">
              <i className="ri-information-line text-blue-400 text-xl flex-shrink-0"></i>
              <div className="text-sm text-blue-300">
                <p className="font-semibold mb-1">Requisitos dos documentos:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-300/80">
                  <li>Formatos aceites: JPG, PNG ou PDF</li>
                  <li>Tamanho máximo: 10MB por ficheiro</li>
                  <li>Documentos devem estar legíveis e sem cortes</li>
                  <li>Validade do documento não pode estar expirada</li>
                  <li>Os documentos são enviados automaticamente para análise após o carregamento</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <DocumentUploadCard
              title="Documento de Identidade (Frente)"
              description="BI, Cartão de Cidadão ou Passaporte - Lado da frente"
              icon="ri-id-card-line"
              documentType="id_front"
              step={1}
            />

            <DocumentUploadCard
              title="Documento de Identidade (Verso)"
              description="BI, Cartão de Cidadão ou Passaporte - Lado de trás"
              icon="ri-id-card-line"
              documentType="id_back"
              step={2}
            />

            <DocumentUploadCard
              title="Comprovativo de Morada"
              description="Fatura de serviços ou extrato bancário (últimos 3 meses)"
              icon="ri-home-4-line"
              documentType="proof_address"
              step={3}
            />

            <DocumentUploadCard
              title="Selfie"
              description="Foto do seu rosto com boa iluminação e fundo neutro"
              icon="ri-user-smile-line"
              documentType="selfie"
              step={4}
            />
          </div>

          <div className="mt-8 bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <i className="ri-shield-check-line text-green-500 text-2xl"></i>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-2">Os seus dados estão seguros</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Todos os documentos são encriptados e armazenados de forma segura. Utilizamos apenas para verificação
                  de identidade conforme exigido por lei. Os seus dados nunca serão partilhados com terceiros sem o seu
                  consentimento.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default VerificationPage;
