import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useOS } from '../context/OSContext';

export function Notifications() {
  const { notifications, dismissNotice, settings } = useOS();
  const toasts = notifications.filter((notice) => notice.toast).slice(0, 3);
  const motionOn = settings.animations;

  return (
    <div className="toast-wrap" aria-live="polite">
      <AnimatePresence>
        {toasts.map((notice) => {
          const body = (
            <div className={`toast is-${notice.kind}`} data-testid="toast">
              <div>
                <strong>{notice.title}</strong>
                {notice.body && <p>{notice.body}</p>}
              </div>
              <button type="button" className="icon-btn" aria-label="Dismiss notification" onClick={() => dismissNotice(notice.id)}>
                <X size={14} />
              </button>
            </div>
          );
          if (!motionOn) return <div key={notice.id}>{body}</div>;
          return (
            <motion.div
              key={notice.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.18 }}
            >
              {body}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
