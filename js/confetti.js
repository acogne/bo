// Petite animation de cotillons (canvas-free, aucune dépendance externe) —
// déclenchée quand une tâche Quotidien est cochée, pour une touche festive.
// Purement visuel : aucun état, aucune persistance.

const Confetti = (() => {
  const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ca8a04', '#ef4444'];

  function burst({ count = 60 } = {}) {
    const container = document.createElement('div');
    container.className = 'confetti-container';

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      piece.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
      piece.style.animationDelay = `${Math.random() * 0.3}s`;
      piece.style.setProperty('--rotate-end', `${(Math.random() > 0.5 ? 1 : -1) * (720 + Math.random() * 360)}deg`);
      piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
      container.appendChild(piece);
    }

    document.body.appendChild(container);
    setTimeout(() => container.remove(), 3000);
  }

  return { burst };
})();
