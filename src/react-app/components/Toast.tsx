import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Bell, AlertCircle } from 'lucide-react'; 
 import { useApp } from '@/react-app/contexts/AppContext'; 
 
 interface ToastProps { 
   id: string; 
   type: 'success' | 'error' | 'info' | 'warning'; 
   message: string; 
 } 
 
 export function Toast({ id, type, message }: ToastProps) { 
   const { removeNotification } = useApp(); 
 
   const icons = { 
     success: <Check className="text-green-600" size={20} />, 
     error: <X className="text-red-600" size={20} />, 
     info: <Bell className="text-blue-600" size={20} />, 
     warning: <AlertCircle className="text-yellow-600" size={20} /> 
   }; 
 
   const bgColors = { 
     success: 'bg-green-50 border-green-300', 
     error: 'bg-red-50 border-red-300', 
     info: 'bg-blue-50 border-blue-300', 
     warning: 'bg-yellow-50 border-yellow-300' 
   }; 
 
   useEffect(() => { 
     const timer = setTimeout(() => removeNotification(id), 5000); 
     return () => clearTimeout(timer); 
   }, [id, removeNotification]); 
 
   return ( 
     <div className={`${bgColors[type]} border rounded-lg p-4 shadow-lg flex items-start gap-3 animate-slide-in`}> 
       {icons[type]} 
       <div className="flex-1"> 
         <p className="text-sm font-medium text-gray-900">{message}</p> 
       </div> 
       <button onClick={() => removeNotification(id)} className="text-gray-400 hover:text-gray-600"> 
         <X size={16} /> 
       </button> 
     </div> 
   ); 
 } 
 
 export function ToastContainer() { 
   const { notifications } = useApp(); 
 
   return createPortal( 
     <div className="fixed top-4 right-4 z-[9999] space-y-2 max-w-md pointer-events-none"> 
       <div className="pointer-events-auto space-y-2">
         {notifications.map(notification => ( 
           <Toast key={notification.id} {...notification} /> 
         ))} 
       </div>
     </div>,
     document.body
   ); 
 }