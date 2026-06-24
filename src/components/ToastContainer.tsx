import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, Check, Info, X, AlertTriangle } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title?: string;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  return (
    <div 
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5 max-w-md w-full pointer-events-none"
      id="global-toast-container"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          let bgColor = "bg-[#0F1115]/95";
          let borderColor = "border-[#2D3036]";
          let iconColor = "text-[#8E9299]";
          let IconComponent = Info;

          if (toast.type === "success") {
            bgColor = "bg-[#0B1A12]/95";
            borderColor = "border-emerald-500/40";
            iconColor = "text-[#4ADE80]";
            IconComponent = Check;
          } else if (toast.type === "error") {
            bgColor = "bg-[#1E0D11]/95";
            borderColor = "border-rose-500/40";
            iconColor = "text-rose-400";
            IconComponent = AlertCircle;
          } else if (toast.type === "warning") {
            bgColor = "bg-[#1C160C]/95";
            borderColor = "border-amber-500/40";
            iconColor = "text-amber-400";
            IconComponent = AlertTriangle;
          }

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ type: "spring", damping: 20, stiffness: 220 }}
              className={`p-3.5 rounded border ${bgColor} ${borderColor} shadow-xl shadow-black/60 flex gap-3 pointer-events-auto backdrop-blur-sm`}
            >
              <div className="flex-shrink-0 mt-0.5">
                <IconComponent className={`h-4.5 w-4.5 ${iconColor}`} />
              </div>
              <div className="flex-grow font-mono text-xs">
                {toast.title && (
                  <div className="text-[10px] text-white font-bold uppercase tracking-wider mb-0.5">
                    {toast.title}
                  </div>
                )}
                <div className="text-[#8E9299] text-[10px] leading-relaxed break-words whitespace-pre-line">
                  {toast.message}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onClose(toast.id)}
                className="flex-shrink-0 h-4 w-4 text-[#5C616A] hover:text-white transition-colors cursor-pointer self-start"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
