/* ─── Theme Management ─────────────────────────────── */
(function () {
  var KEY = 'classconnect_theme';

  function getTheme() {
    return localStorage.getItem(KEY) || 'light';
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(KEY, t);
  }

  // Expose toggle for sidebar button
  window.__toggleTheme = function () {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  };

  // Ensure the attribute is correct (the inline script already set it,
  // but this guarantees consistency if background.js loads on a page
  // that doesn't include background.ejs)
  applyTheme(getTheme());
})();

const particlesContainer = document.getElementById("particles-container");

// Detect if user is on a mobile device or small screen
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;

// Only initialize particles if it's not a mobile device and container exists
if (!isMobile && particlesContainer) {
  // Reduced particle count slightly for better baseline performance
  const particleCount = 100; 

  for (let i = 0; i < particleCount; i++) createParticle();

  function createParticle() {
    const particle = document.createElement("div");
    particle.className = "particle";
    const size = Math.random() * 3 + 1;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    resetParticle(particle);
    particlesContainer.appendChild(particle);
    animateParticle(particle);
  }

  function resetParticle(particle) {
    const posX = Math.random() * 100;
    const posY = Math.random() * 100;
    particle.style.left = `${posX}%`;
    particle.style.top = `${posY}%`;
    particle.style.opacity = "0";
    return { x: posX, y: posY };
  }

  function animateParticle(particle) {
    const pos = resetParticle(particle);
    const duration = Math.random() * 10 + 10;
    const delay = Math.random() * 5;
    setTimeout(() => {
      particle.style.transition = `all ${duration}s linear`;
      particle.style.opacity = Math.random() * 0.5 + 0.3; // Increased opacity
      const moveX = pos.x + (Math.random() * 20 - 10);
      const moveY = pos.y - Math.random() * 30;
      particle.style.left = `${moveX}%`;
      particle.style.top = `${moveY}%`;
      setTimeout(() => animateParticle(particle), duration * 1000);
    }, delay * 100);
  }

  // Throttle mousemove events to improve performance even on desktop
  let lastMoveTime = 0;
  
  document.addEventListener("mousemove", (e) => {
    const now = Date.now();
    // Only create a particle every 50ms at most
    if (now - lastMoveTime < 50) return;
    lastMoveTime = now;

    const mouseX = (e.clientX / window.innerWidth) * 100;
    const mouseY = (e.clientY / window.innerHeight) * 100;
    const particle = document.createElement("div");
    particle.className = "particle";
    const size = Math.random() * 4 + 2;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${mouseX}%`;
    particle.style.top = `${mouseY}%`;
    particle.style.opacity = "0.6";
    particlesContainer.appendChild(particle);
    
    setTimeout(() => {
      particle.style.transition = "all 2s ease-out";
      particle.style.left = `${mouseX + (Math.random() * 10 - 5)}%`;
      particle.style.top = `${mouseY + (Math.random() * 10 - 5)}%`;
      particle.style.opacity = "0";
      setTimeout(() => particle.remove(), 2000);
    }, 10);
  });
}