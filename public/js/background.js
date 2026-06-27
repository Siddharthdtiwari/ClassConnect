/* ─── Theme Management ─────────────────────────────── */
(function () {
  var KEY = 'classconnect_theme';

  function getTheme() {
    return localStorage.getItem(KEY) || 'light';
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');

    // Sync body style defaults as fallback
    if (document.body) {
      document.body.style.background = t === 'dark' ? '#05050a' : '#F5F1FC';
      document.body.style.color = t === 'dark' ? '#F0EBE0' : '#0C0C0C';
    }

    localStorage.setItem(KEY, t);
  }

  // Expose toggle for sidebar button
  window.__toggleTheme = function () {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  };

  window.setGlobalTheme = function (t, e) {
    if (e) e.stopPropagation();
    applyTheme(t);
  };

  // Ensure consistent theme on load
  applyTheme(getTheme());
})();

// Initialize background elements and theme toggle when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  // 1. Create and prepend background divs if they don't exist
  if (!document.querySelector('.grain')) {
    const grain = document.createElement('div');
    grain.className = 'grain';
    document.body.prepend(grain);
  }
  
  if (!document.querySelector('.orb1')) {
    const orb1 = document.createElement('div');
    orb1.className = 'orb orb1';
    document.body.prepend(orb1);
  }
  
  if (!document.querySelector('.orb2')) {
    const orb2 = document.createElement('div');
    orb2.className = 'orb orb2';
    document.body.prepend(orb2);
  }
  
  let particlesContainer = document.getElementById("particles-container");
  if (!particlesContainer) {
    particlesContainer = document.createElement('div');
    particlesContainer.id = 'particles-container';
    document.body.prepend(particlesContainer);
  }

  // 2. Create floating theme toggle if not present and no other theme toggle exists on page
  const hasSidebarToggle = document.getElementById('sb-theme-toggle');
  const hasPageToggle = document.querySelector('.theme-toggle');
  const hasFloatingToggle = document.querySelector('.floating-theme-toggle');
  
  if (!hasSidebarToggle && !hasPageToggle && !hasFloatingToggle) {
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'floating-theme-toggle';
    
    const lightBtn = document.createElement('button');
    lightBtn.className = 'ft-btn ft-btn-light';
    lightBtn.title = 'Light Mode';
    lightBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    lightBtn.onclick = (e) => setGlobalTheme('light', e);
    
    const darkBtn = document.createElement('button');
    darkBtn.className = 'ft-btn ft-btn-dark';
    darkBtn.title = 'Dark Mode';
    darkBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    darkBtn.onclick = (e) => setGlobalTheme('dark', e);
    
    toggleContainer.appendChild(lightBtn);
    toggleContainer.appendChild(darkBtn);
    document.body.appendChild(toggleContainer);
  }

  // 4. Add Powered By ClassConnect Footer
  if (!document.getElementById('global-powered-by') && !document.querySelector('.footer-powered')) {
    const poweredBy = document.createElement('div');
    poweredBy.id = 'global-powered-by';
    poweredBy.innerHTML = `Powered by <a href="https://classconnects.vercel.app" target="_blank" style="color:var(--pt);text-decoration:none;font-weight:700;">ClassConnect</a>`;
    poweredBy.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);font-family:'Space Mono',monospace;font-size:0.6rem;color:var(--fdd);z-index:9999;letter-spacing:0.05em;pointer-events:auto;transition:color 0.3s;backdrop-filter:blur(4px);padding:4px 8px;border-radius:4px;";
    document.body.appendChild(poweredBy);
  }

  // 3. Initialize particles if not on mobile
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
  if (!isMobile && particlesContainer) {
    const particleCount = 100; 
    for (let i = 0; i < particleCount; i++) createParticle(particlesContainer);
    
    // Throttle mousemove events to improve performance
    let lastMoveTime = 0;
    document.addEventListener("mousemove", (e) => {
      const now = Date.now();
      if (now - lastMoveTime < 50) return;
      lastMoveTime = now;

      const mouseX = (e.clientX / window.innerWidth) * 100;
      const mouseY = (e.clientY / window.innerHeight) * 100;
      createCursorParticle(particlesContainer, mouseX, mouseY);
    });
  }
});

function createParticle(container) {
  const particle = document.createElement("div");
  particle.className = "particle";
  const size = Math.random() * 3 + 1;
  particle.style.width = `${size}px`;
  particle.style.height = `${size}px`;
  resetParticle(particle);
  container.appendChild(particle);
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
    particle.style.opacity = Math.random() * 0.5 + 0.3;
    const moveX = pos.x + (Math.random() * 20 - 10);
    const moveY = pos.y - Math.random() * 30;
    particle.style.left = `${moveX}%`;
    particle.style.top = `${moveY}%`;
    setTimeout(() => animateParticle(particle), duration * 1000);
  }, delay * 100);
}

function createCursorParticle(container, mouseX, mouseY) {
  const particle = document.createElement("div");
  particle.className = "particle";
  const size = Math.random() * 4 + 2;
  particle.style.width = `${size}px`;
  particle.style.height = `${size}px`;
  particle.style.left = `${mouseX}%`;
  particle.style.top = `${mouseY}%`;
  particle.style.opacity = "0.6";
  container.appendChild(particle);
  
  setTimeout(() => {
    particle.style.transition = "all 2s ease-out";
    particle.style.left = `${mouseX + (Math.random() * 10 - 5)}%`;
    particle.style.top = `${mouseY + (Math.random() * 10 - 5)}%`;
    particle.style.opacity = "0";
    setTimeout(() => particle.remove(), 2000);
  }, 10);
}