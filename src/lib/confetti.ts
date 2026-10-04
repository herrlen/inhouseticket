// Tiny confetti puff (KONZEPT §5.3) – a few spans animated with the Web Animations API.
// No library, no canvas. Skipped entirely when the user prefers reduced motion.

export function confettiBurst(x: number, y: number, color: string) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const colors = [color, color, "#F5C400", "#FF6B5B", "#2EC4B6"];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement("span");
    el.setAttribute("aria-hidden", "true");
    const size = 4 + Math.random() * 4;
    Object.assign(el.style, {
      position: "fixed",
      left: `${x}px`,
      top: `${y}px`,
      width: `${size}px`,
      height: `${size * 0.6}px`,
      background: colors[i % colors.length],
      borderRadius: "1px",
      pointerEvents: "none",
      zIndex: "200",
    });
    document.body.appendChild(el);
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
    const distance = 40 + Math.random() * 50;
    el.animate(
      [
        { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
        { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance - 20}px) rotate(${Math.random() * 360}deg)`, opacity: 0 },
      ],
      { duration: 650 + Math.random() * 250, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    ).onfinish = () => el.remove();
  }
}
