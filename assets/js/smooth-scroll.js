/* ==============================================================
   Scroll fluide à la molette, avec légère inertie.

   Par défaut, une molette de souris fait défiler la page par sauts
   (ligne par ligne), sans aucune inertie — contrairement à un trackpad
   qui produit déjà nativement une longue traîne d'évènements "wheel"
   qui décroissent en douceur. Comme l'API WheelEvent ne permet pas de
   distinguer les deux matériels, on applique le même traitement aux
   deux.

   Modèle VITESSE + FRICTION (vraie inertie physique), pas un lerp de
   position vers une cible cumulative : ce dernier "claque" l'essentiel
   du trajet dans les toutes premières frames puis traîne indéfiniment
   sur la fin (courbe exponentielle vers une cible = mauvaise forme
   pour une sensation d'inertie). Ici, chaque évènement "wheel" ajoute
   une IMPULSION à une vitesse, qui décroît ensuite en douceur — comme
   un objet qu'on pousse et qui ralentit par friction.

   L'intégration position/vitesse utilise la solution analytique exacte
   de la décroissance exponentielle (pas un simple pas d'Euler) : la
   distance totale parcourue et le temps de stabilisation restent
   IDENTIQUES quel que soit le FPS réel (cette page est lourde pendant
   le scroll, le FPS chute facilement — un calcul non-exact ralentirait
   d'autant, ce qui était le bug précédent).

   Comme on pilote un VRAI scroll (window.scrollTo, pas un transform
   sur un wrapper), window.scrollY et les évènements "scroll" natifs
   restent exacts à chaque frame : tout le reste du site (nav, volets,
   reveals, IntersectionObserver, parallaxes) continue de fonctionner
   sans aucune modification.
   ============================================================== */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return; // respecte la préférence système : scroll natif, tel quel

  if (!("onwheel" in window)) return; // pas de molette (tactile) : natif, déjà fluide

  const REF_DT = 1000 / 60;

  // SENSITIVITY : fraction du delta d'un évènement "wheel" convertie en
  // vitesse (en px par intervalle de référence de 16.7ms).
  // FRICTION : fraction de vitesse conservée à chaque intervalle de
  // référence (0.80 = 20% perdu par "frame @60fps" équivalente).
  // Avec ces valeurs, un clic de molette (~110px) parcourt ~130px au
  // total et se stabilise en ~450-500ms — perceptible mais léger.
  const SENSITIVITY = 0.26;
  const FRICTION = 0.8;
  const L = -Math.log(FRICTION); // constante de la décroissance exponentielle
  const STOP_VELOCITY = 0.05;

  let position = window.scrollY;
  let velocity = 0;
  let ticking = false;
  let lastTime = 0;

  // scrollHeight force un reflow s'il est lu à chaque évènement "wheel" —
  // on le met en cache, recalculé seulement au resize et périodiquement
  // (le contenu peut changer de hauteur après coup : images, reveals…).
  let maxScrollCache = document.documentElement.scrollHeight - window.innerHeight;
  const refreshMaxScroll = () => {
    maxScrollCache = document.documentElement.scrollHeight - window.innerHeight;
  };
  window.addEventListener("resize", refreshMaxScroll);
  setInterval(refreshMaxScroll, 1000);

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  // deltaMode : 0 = pixels (le plus courant, trackpads et souris modernes),
  // 1 = lignes (Firefox notamment), 2 = pages (rare)
  const normalizeDelta = (e) => {
    if (e.deltaMode === 1) return e.deltaY * 18;
    if (e.deltaMode === 2) return e.deltaY * window.innerHeight;
    return e.deltaY;
  };

  const tick = (now) => {
    const dt = lastTime ? Math.min(now - lastTime, 100) : REF_DT;
    lastTime = now;

    const decay = Math.pow(FRICTION, dt / REF_DT);
    // intégrale exacte de v0*decay^(t) sur [0, dt] : distance = v0*(1-decay)/L
    position += (velocity * (1 - decay)) / L;
    velocity *= decay;

    const max = maxScrollCache;
    if (position < 0) {
      position = 0;
      velocity = 0;
    } else if (position > max) {
      position = max;
      velocity = 0;
    }

    // behavior:"instant" est OBLIGATOIRE ici : html a scroll-behavior:smooth
    // en CSS (pour les clics d'ancre), et window.scrollTo(x, y) HÉRITE ce
    // comportement — sans cette option, le navigateur essaie d'animer en
    // douceur CHAQUE micro-pas de notre propre boucle, ce qui superpose deux
    // animations qui s'interrompent en permanence (c'était le vrai bug).
    window.scrollTo({ top: position, left: 0, behavior: "instant" });

    if (Math.abs(velocity) < STOP_VELOCITY) {
      ticking = false;
      lastTime = 0;
      return;
    }
    requestAnimationFrame(tick);
  };

  window.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      velocity += normalizeDelta(e) * SENSITIVITY;
      if (!ticking) {
        ticking = true;
        lastTime = 0;
        requestAnimationFrame(tick);
      }
    },
    { passive: false }
  );

  // Resynchronise la position si la page défile autrement que par la
  // molette (barre de défilement, clavier, ancre #lien) — sans quoi la
  // prochaine molette repartirait d'une position obsolète.
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return; // c'est notre propre tick qui vient de scroller, on ignore l'écho
      position = window.scrollY;
      velocity = 0;
    },
    { passive: true }
  );
})();
