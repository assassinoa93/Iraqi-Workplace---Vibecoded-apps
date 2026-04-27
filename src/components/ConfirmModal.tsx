import React from 'react';
import { motion } from 'motion/react';
import { Trash2, Info } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useModalKeys } from '../lib/hooks';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  extraAction?: {
    label: string;
    onClick: () => void;
    icon?: any;
  };
  // When true, renders as a single-button informational dialog (no destructive
  // styling, no "Cancel" path). Used as the polished replacement for native
  // `alert()` so messages respect RTL layout and the app's visual language.
  infoOnly?: boolean;
}

export function ConfirmModal({ isOpen, onClose, onConfirm, title, message, extraAction, infoOnly }: ConfirmModalProps) {
  const { t } = useI18n();
  const cancelRef = useModalKeys(isOpen, onClose) as React.RefObject<HTMLButtonElement>;
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-sm rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
      >
        <div className="p-6 text-center">
          <div className={infoOnly
            ? "w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"
            : "w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4"}>
            {infoOnly ? <Info className="w-6 h-6" /> : <Trash2 className="w-6 h-6" />}
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
          <p className="text-sm text-slate-500 mb-6 whitespace-pre-line">{message}</p>

          {extraAction && (
            <button
              onClick={extraAction.onClick}
              className="w-full flex items-center justify-center gap-2 mb-4 px-4 py-3 bg-blue-50 text-blue-700 rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-all border border-blue-100"
            >
              {extraAction.icon && <extraAction.icon className="w-4 h-4" />}
              {extraAction.label}
            </button>
          )}

          {infoOnly ? (
            <button
              ref={cancelRef}
              onClick={() => { onConfirm(); onClose(); }}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md"
            >
              {t('action.confirm')}
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                ref={cancelRef}
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                {t('modal.confirm.cancel')}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-md"
              >
                {t('modal.confirm.confirm')}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
