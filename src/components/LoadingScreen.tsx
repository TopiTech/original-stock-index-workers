import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export function LoadingScreen({ message = "INITIALIZING..." }: { message?: string }) {
  return (
    <div
      className="app"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "2px solid transparent",
            borderTopColor: "var(--neon-cyan)",
            borderRightColor: "var(--neon-cyan)",
          }}
        />
      </motion.div>
      <div className="muted mono" style={{ letterSpacing: 2, fontSize: 12 }}>
        {message}
      </div>
    </div>
  );
}
