import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useNotifications } from "../../store/NotificationContext";

const BAR = {
  critical: "#c35d5d",
  warning: "#c39a4a",
  recovery: "#5b9e77",
  info: "#6f9dc0",
};

export function Toaster() {
  const { notifications, dismiss } = useNotifications();
  return (
    <div className="pointer-events-none fixed right-4 top-14 z-50 flex w-80 flex-col gap-1.5">
      <AnimatePresence>
        {notifications.slice(0, 5).map((n) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-auto overflow-hidden rounded border border-line bg-panel"
          >
            <div className="flex items-start gap-0">
              <span className="w-0.5 self-stretch" style={{ backgroundColor: BAR[n.severity] }} />
              <div className="flex flex-1 items-start gap-2 px-3 py-2">
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-ink">{n.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted">{n.message}</p>
                </div>
                <button
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(n.id)}
                  className="text-dim transition-colors hover:text-ink"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
