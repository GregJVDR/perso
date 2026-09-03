(() => {
  "use strict";

  // gate CSS "closed" panel states behind JS availability
  document.documentElement.classList.add("js");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------------- Ordonnanceur de scroll ----------------
     Un seul écouteur "scroll" et une seule frame rAF pour tout le site.
     Chaque effet s'y abonne au lieu d'ouvrir son propre écouteur avec sa
     propre boucle : on planifiait jusqu'à 5 rappels rAF par frame, chacun
     lisant la géométrie (getBoundingClientRect) puis écrivant des styles.
     Entrelacer ainsi lectures et écritures oblige le navigateur à
     recalculer la mise en page plusieurs fois dans la même frame. Ici tout
     s'exécute dans une frame unique, dans l'ordre d'inscription — qui est
     celui des anciens écouteurs, donc le comportement est inchangé. */
  const scrollJobs = [];
  let scrollScheduled = false;
  const runScrollJobs = () => {
    scrollScheduled = false;
    for (let i = 0; i < scrollJobs.length; i++) scrollJobs[i]();
  };
  const onScrollFrame = (job) => {
    scrollJobs.push(job);
  };
  window.addEventListener(
    "scroll",
    () => {
      if (scrollScheduled) return;
      scrollScheduled = true;
      requestAnimationFrame(runScrollJobs);
    },
    { passive: true }
  );

  /* ---------------- Preloader ---------------- */
  const preloader = document.getElementById("preloader");
  const preloaderFill = document.getElementById("preloaderFill");
  const navEl = document.getElementById("siteNav");
  document.body.classList.add("is-loading");
  const preloaderStart = performance.now();

  // Durée minimale d'affichage du préchargeur : sur un chargement rapide
  // (local, ressources en cache…), 'load' peut arriver quasi instantanément
  // et couperait l'animation des lettres GJ en plein milieu. On garantit
  // qu'elle a toujours le temps de se jouer, sans jamais RALENTIR un
  // chargement réellement plus long que ce plancher.
  const PRELOADER_MIN_MS = 2000;

  // Callback optionnel posé plus bas dans le script (entrée du nom du
  // hero) : ne PEUT pas s'exécuter tant que le préchargeur n'est pas fini,
  // sans quoi l'animation se joue entièrement cachée derrière l'écran de
  // chargement et personne ne la voit jamais.
  let onPreloaderDone = null;

  // Révèle la nav (.nav--in, voir CSS) un peu APRÈS que le préchargeur ait
  // commencé à s'effacer, pour un enchaînement en deux temps plutôt que
  // tout d'un coup. Toujours appelé, même si 'load' tarde (filet de
  // sécurité ci-dessous), pour garantir que la nav finisse par apparaître.
  const revealNav = () => {
    navEl && navEl.classList.add("nav--in");
    if (onPreloaderDone) onPreloaderDone();
  };

  let fake = 0;
  const fakeLoad = setInterval(() => {
    fake += Math.random() * 18;
    if (fake >= 92) fake = 92;
    preloaderFill.style.width = fake + "%";
  }, 140);

  window.addEventListener("load", () => {
    clearInterval(fakeLoad);
    preloaderFill.style.width = "100%";
    const elapsed = performance.now() - preloaderStart;
    const remaining = Math.max(PRELOADER_MIN_MS - elapsed, 350);
    setTimeout(() => {
      preloader.classList.add("is-done");
      document.body.classList.remove("is-loading");
      document.body.classList.add("is-ready");
    }, remaining);
    setTimeout(revealNav, remaining + 300);
  });

  // Safety net in case 'load' never fires quickly
  setTimeout(() => {
    if (!document.body.classList.contains("is-ready")) {
      clearInterval(fakeLoad);
      preloader.classList.add("is-done");
      document.body.classList.remove("is-loading");
    }
    revealNav();
  }, 4000);

  /* ---------------- Footer year ---------------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------- Split hero name into words for stagger reveal ---------------- */
  document.querySelectorAll("[data-split]").forEach((line, lineIndex) => {
    const text = line.textContent;
    const words = text.split(" ");
    line.innerHTML = words
      .map((w, i) => `<span class="word" style="transition-delay:${0.4 + lineIndex * 0.3 + i * 0.12}s">${w}</span>`)
      .join(" ");
  });

  const heroWordStyle = document.createElement("style");
  heroWordStyle.textContent = `
    .hero__name .word { opacity: 0; transform: translateY(110%) rotate(4deg); transition-property: opacity, transform; transition-duration: 2s; transition-timing-function: cubic-bezier(.16,1,.3,1); }
    .hero__name.is-in .word { opacity: 1; transform: translateY(0) rotate(0deg); }
  `;
  document.head.appendChild(heroWordStyle);

  const heroNameEl = document.querySelector(".hero__name");
  const heroCoverPanel = document.querySelector(".panel--cover");
  if (heroNameEl && heroCoverPanel) {
    // .hero est sticky : il reste géométriquement "visible" pour un
    // IntersectionObserver pendant toute la durée où le volet .panel--cover
    // le recouvre par-dessus (l'observer ne voit que la géométrie, pas
    // l'occlusion). On suit donc la position du volet recouvrant lui-même —
    // seul signal fiable de "le nom est-il visuellement caché ou non" —
    // pour rejouer l'entrée à chaque fois qu'il redevient visible.
    const updateHeroName = () => {
      const coverTop = heroCoverPanel.getBoundingClientRect().top;
      const covered = coverTop < window.innerHeight * 0.2; // volet monté sur ~80% de l'écran
      heroNameEl.classList.toggle("is-in", !covered);
    };
    onScrollFrame(updateHeroName);
    // Pas d'appel immédiat : le premier passage attend la fin du
    // préchargeur (voir onPreloaderDone plus haut) pour que l'entrée soit
    // réellement visible au lieu de se jouer derrière l'écran de chargement.
    onPreloaderDone = updateHeroName;
  } else if (heroNameEl) {
    heroNameEl.classList.add("is-in");
  }

  /* ---------------- Domaines : tambour 3D (mots sur un vrai cercle) ----------------
     Chaque mot est positionné une fois pour toutes sur un cercle en 3D
     (translation sin/cos + rotateX propre au mot, comme du texte gravé
     autour d'un tambour). Au scroll, c'est tout le tambour (.domains__cylinder)
     qui tourne d'un bloc — la section .domains réserve une hauteur de
     scroll pendant laquelle .domains__sticky reste figée à l'écran
     (position: sticky), ce défilement "sur place" est ce qui fait tourner
     le cylindre. Le mot qui passe devant (angle ≈ 0 par rapport à la
     rotation courante) ressort en pleine opacité + taille ; les autres
     s'estompent avec la distance angulaire, jusqu'à disparaître. */
  const domainsSection = document.querySelector(".domains");
  const domainsCylinder = document.querySelector(".domains__cylinder");
  const domainItems = Array.from(document.querySelectorAll(".domains__item"));
  if (domainsSection && domainsCylinder && domainItems.length && !reduceMotion) {
    const STEP_DEG = 9; // écart angulaire entre deux mots consécutifs sur le tambour
    const FADE_RANGE_DEG = STEP_DEG * 5; // distance angulaire au bout de laquelle un mot est quasi invisible
    const MIN_OPACITY = 0.08;
    const ACTIVE_THRESHOLD_DEG = STEP_DEG / 2;

    const domainsSticky = document.querySelector(".domains__sticky");
    let radius = 0;
    // Géométrie de la zone épinglée, relue au resize : la fenêtre figée ne
    // fait pas la hauteur de l'écran (voir .domains__sticky), donc la durée
    // d'épinglage vaut hauteur de section − hauteur de fenêtre, et elle
    // démarre quand le haut de la section atteint l'offset `top` du sticky.
    let stickyTop = 0;
    let stickyHeight = 0;
    const layout = () => {
      // Rayon et perspective doivent rester dans un rapport constant de 2.5
      // (voir .domains__sticky) : c'est lui qui fixe le grossissement du mot
      // le plus proche, à 1.67× sur tous les écrans. Les deux axes sont
      // pondérés séparément — indexer le rayon sur min(vw,vh) tout court
      // écrasait le tambour sur un téléphone, où la largeur est la petite
      // dimension alors que la hauteur, elle, ne manque pas.
      radius = Math.min(window.innerWidth * 0.62, window.innerHeight * 0.42);
      stickyTop = parseFloat(getComputedStyle(domainsSticky).top) || 0;
      stickyHeight = domainsSticky.offsetHeight;
      domainItems.forEach((el, i) => {
        const angleDeg = i * STEP_DEG;
        const angleRad = (angleDeg * Math.PI) / 180;
        const ty = Math.sin(angleRad) * radius;
        const tz = Math.cos(angleRad) * radius;
        el.style.transform =
          `translate3d(-50%, -50%, 0) translate3d(0, ${ty.toFixed(2)}px, ${tz.toFixed(2)}px) rotateX(${(-angleDeg).toFixed(2)}deg)`;
      });
    };

    const updateDomains = () => {
      const rect = domainsSection.getBoundingClientRect();
      const scrollable = rect.height - stickyHeight;
      const progress =
        scrollable > 0
          ? Math.min(Math.max((stickyTop - rect.top) / scrollable, 0), 1)
          : 0;
      const wrapRotation = progress * (domainItems.length - 1) * STEP_DEG;

      domainsCylinder.style.transform = `translate3d(-50%, -50%, 0) rotateX(${wrapRotation.toFixed(2)}deg)`;

      domainItems.forEach((el, i) => {
        const dist = Math.abs(i * STEP_DEG - wrapRotation);
        el.classList.toggle("is-active", dist < ACTIVE_THRESHOLD_DEG);
        const fade = Math.max(0, 1 - dist / FADE_RANGE_DEG);
        el.style.opacity = Math.max(MIN_OPACITY, fade).toFixed(3);
      });
    };

    layout();
    updateDomains();
    onScrollFrame(updateDomains);
    window.addEventListener("resize", () => {
      layout();
      updateDomains();
    });
  } else {
    domainItems.forEach((el) => {
      el.style.opacity = "1";
    });
  }

  /* ---------------- Entrée des blocs de texte ----------------
     Le texte monte d'un seul tenant, paragraphe par paragraphe, légèrement
     décalés. Remplace une cascade mot par mot qui découpait le paragraphe
     en ~90 <span> animés en flou : peu sobre à lire, et coûteux (autant de
     filter: blur() composités en même temps pendant le scroll).
     Une unité = un <p> enfant, ou l'élément lui-même s'il n'en contient
     pas (cas du paragraphe unique de Contact). */
  document.querySelectorAll("[data-reveal-text]").forEach((el) => {
    const paras = el.querySelectorAll(":scope > p");
    const units = paras.length ? Array.from(paras) : [el];
    units.forEach((unit, i) => {
      unit.classList.add("rt-unit");
      if (i) unit.style.transitionDelay = (i * 0.09).toFixed(2) + "s";
    });
  });

  /* ---------------- Split horizontal : volet droite → gauche au scroll ---------------- */
  document.querySelectorAll("[data-split-right]").forEach((el) => {
    const lines = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = lines
      .map(
        (line, i) =>
          `<span class="xline"><span class="xline__inner" style="transition-delay:${0.1 + i * 0.3}s">${line}</span></span>`
      )
      .join("");
  });

  /* ---------------- Suspension des animations hors écran ----------------
     Les animations décoratives en boucle (bandeau défilant, jauges de
     compétences, fond et halo de Contact) tournaient en permanence, y compris
     très loin de l'écran : mesuré, 8 des 18 animations actives étaient hors
     champ. Chacune coûte un recalcul de style par frame, pour rien.
     On les met en pause tant que leur section n'est pas approchée. La marge
     d'un écran garantit qu'elles ont repris avant d'être visibles. */
  const animatedDecor = document.querySelectorAll("[data-anim-pause]");
  if (animatedDecor.length && "IntersectionObserver" in window) {
    const ioAnim = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("anim-paused", !entry.isIntersecting);
        });
      },
      { rootMargin: "100% 0px 100% 0px" }
    );
    animatedDecor.forEach((el) => ioAnim.observe(el));
  }

  /* ---------------- Scroll reveal (IntersectionObserver) ----------------
     Rejoue à chaque passage, dans les deux sens : on bascule .in-view selon
     l'intersection au lieu de l'ajouter une fois puis d'unobserve. */
  const revealEls = document.querySelectorAll(
    "[data-reveal], [data-split-right], [data-reveal-text], [data-title-drop]"
  );
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("in-view", entry.isIntersecting);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in-view"));
  }

  /* ---------------- Counters ----------------
     Recompte à chaque entrée. Un jeton par élément invalide toute boucle
     rAF encore en vol si on ressort avant la fin (évite les sauts de valeur
     en cas d'allers-retours rapides). */
  const counters = document.querySelectorAll("[data-count]");
  const counterTokens = new WeakMap();
  const animateCounter = (el) => {
    const token = Symbol();
    counterTokens.set(el, token);
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const duration = 1400;
    const start = performance.now();
    const step = (now) => {
      if (counterTokens.get(el) !== token) return; // une entrée plus récente a pris le relais
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ("IntersectionObserver" in window) {
    const ioCount = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
          } else {
            counterTokens.delete(entry.target);
            entry.target.textContent = "0" + (entry.target.dataset.suffix || "");
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((el) => ioCount.observe(el));
  }

  /* ---------------- Liquid skill bars ----------------
     Se remplit/se vide à chaque passage ; la transition CSS existante sur
     .skillbar__fill gère l'animation dans les deux sens. */
  const bars = document.querySelectorAll("[data-fill]");
  if ("IntersectionObserver" in window) {
    const ioBars = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.style.width = entry.isIntersecting ? entry.target.dataset.fill + "%" : "0%";
        });
      },
      { threshold: 0.4 }
    );
    bars.forEach((el) => ioBars.observe(el));
  }

  /* ---------------- Scroll progress bar ---------------- */
  const progressBar = document.getElementById("progressBar");
  // scaleX et non width : `width` est une propriété de mise en page, elle
  // relayoutait la page à chaque frame de défilement.
  const railFill = document.getElementById("railFill");
  const railNum = document.getElementById("railNum");
  const rail = document.querySelector(".rail");
  const updateProgress = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = docHeight > 0 ? scrollTop / docHeight : 0;
    progressBar.style.transform = `scaleX(${ratio.toFixed(4)})`;
    if (railFill) railFill.style.transform = `scaleY(${ratio.toFixed(4)})`;
  };

  /* ---------------- Nav: hide on scroll down, scrollspy, sliding pill ---------------- */
  const nav = document.getElementById("siteNav");
  const navLinks = document.querySelectorAll("[data-nav]");
  const navIndicator = document.getElementById("navIndicator");
  const navLinksWrap = document.getElementById("navLinks");
  const sections = Array.from(document.querySelectorAll("main section[id]"));

  let lastScrollY = window.scrollY;

  const moveIndicator = (link) => {
    if (!link || !navIndicator || !navLinksWrap) return;
    const wrapRect = navLinksWrap.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    navIndicator.style.width = linkRect.width + "px";
    navIndicator.style.transform = `translateX(${linkRect.left - wrapRect.left}px)`;
  };

  const setActiveLink = (id) => {
    navLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-active", isActive);
      if (isActive && link.closest("#navLinks")) moveIndicator(link);
    });
  };

  /* Scrollspy : on ne retient que les sections qui ONT un lien de nav.
     #domains (le tambour) n'en a pas ; avec l'IntersectionObserver
     précédent, le voir passer appelait setActiveLink("domains"), ce qui
     désactivait TOUS les liens sans en réactiver aucun — la pastille
     restait garée sous un libellé redevenu gris, donc illisible sur le
     fond sombre de la pastille. D'où la nav "cassée" au retour du scroll.

     Un balayage de position remplace l'observer : il désigne toujours
     exactement une section (la dernière dont le haut a franchi la ligne
     de référence), donc l'état actif ne peut plus tomber dans le vide, et
     revenir en haut de page réactive bien "Accueil". */
  const spySections = sections.filter((s) =>
    document.querySelector(`[data-nav][href="#${s.id}"]`)
  );
  let spyId = null;
  const updateSpy = () => {
    if (!spySections.length) return;
    const line = window.innerHeight * 0.45;
    let current = spySections[0];
    for (const s of spySections) {
      if (s.getBoundingClientRect().top <= line) current = s;
    }
    if (current.id !== spyId) {
      spyId = current.id;
      setActiveLink(spyId);
      if (railNum) {
        const n = spySections.indexOf(current) + 1;
        railNum.textContent = String(n).padStart(2, "0");
      }
    }
  };

  window.addEventListener("resize", () => {
    const active = document.querySelector("#navLinks .nav__link.is-active");
    moveIndicator(active);
  });

  const heroEl = document.getElementById("hero");
  const lightPanel = document.querySelector(".panel--light");
  const updateNavTheme = () => {
    const navBottom = nav.offsetHeight + 36;
    // hero : visible seulement sur le premier écran (ensuite couvert/parti)
    let onLight = heroEl && window.scrollY < heroEl.offsetHeight - navBottom;
    // panneau Compétences (papier) : test par position réelle, y compris en phase fixed
    if (!onLight && lightPanel) {
      const r = lightPanel.getBoundingClientRect();
      onLight = r.top < navBottom && r.bottom > 0 && r.left < window.innerWidth * 0.4;
    }
    nav.classList.toggle("nav--on-light", onLight);
    if (rail) {
      rail.classList.toggle("is-on", window.scrollY > window.innerHeight * 0.6);
      rail.classList.toggle("rail--on-light", onLight);
    }
  };

  const onScroll = () => {
    updateProgress();
    updateNavTheme();
    updateSpy();
    const y = window.scrollY;
    if (y > 240 && y > lastScrollY) {
      nav.classList.add("is-hidden");
    } else {
      nav.classList.remove("is-hidden");
    }
    lastScrollY = y;
  };
  onScrollFrame(onScroll);
  window.addEventListener("resize", updateNavTheme);
  updateProgress();
  updateNavTheme();
  updateSpy();
  // Les libellés sont mesurés pour dimensionner la pastille : si la police
  // web arrive après ce premier calcul, leur largeur change et la pastille
  // reste calée sur l'ancienne mesure. On recale une fois les polices prêtes.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      moveIndicator(document.querySelector("#navLinks .nav__link.is-active"));
    });
  }

  setTimeout(() => {
    const activeInitial = document.querySelector(".nav__link.is-active");
    moveIndicator(activeInitial);
  }, 700);

  /* ---------------- Mobile menu ---------------- */
  const burger = document.getElementById("navBurger");
  const mobileMenu = document.getElementById("mobileMenu");
  if (burger && mobileMenu) {
    burger.addEventListener("click", () => {
      const isOpen = mobileMenu.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(isOpen));
      burger.setAttribute("aria-label", isOpen ? "Fermer le menu" : "Ouvrir le menu");
    });
    mobileMenu.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        mobileMenu.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      })
    );
  }


  /* ---------------- Panel entrances (volets variés) ----------------
     Chaque panneau s'ouvre avec sa propre animation (data-panim) et se
     referme de la même façon en sortant du viewport — rejoue à chaque
     passage, dans les deux sens. Le volet hero→about est du CSS pur
     (sticky), indépendant de ce système. */
  const animPanels = document.querySelectorAll("[data-panim]");
  if (animPanels.length && "IntersectionObserver" in window && !reduceMotion) {
    const ioPanim = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("panim-in", entry.isIntersecting);
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px -4% 0px" }
    );
    animPanels.forEach((p) => ioPanim.observe(p));
  } else {
    animPanels.forEach((p) => p.classList.add("panim-in"));
  }

  /* ---------------- Compétences : fenêtre qui arrive de la droite ----------------
     Le spacer (100vh) fournit la distance de scroll. Pendant la phase, le
     panneau passe en position:fixed (aucun tressautement possible) et glisse
     de 100vw → 0 en continu — pas de zone morte : chaque cran de scroll agit.
     1re moitié : À propos figé en bas d'écran ; 2e moitié : il s'échappe vers
     le haut derrière la fenêtre qui finit d'arriver. */
  const hslide = document.querySelector(".hslide");
  const aboutCover = document.querySelector(".panel--cover");
  const slideDesktop = window.matchMedia("(min-width: 861px)");
  if (hslide && aboutCover && !reduceMotion) {
    const hpanel = hslide.firstElementChild;
    let isFixed = false;

    const setFixed = (on) => {
      if (on === isFixed) return;
      isFixed = on;
      if (on) {
        hpanel.style.position = "fixed";
        hpanel.style.top = "0";
        hpanel.style.left = "0";
        hpanel.style.width = "100%";
      } else {
        hpanel.style.position = "";
        hpanel.style.top = "";
        hpanel.style.left = "";
        hpanel.style.width = "";
      }
    };

    // le wrapper garde la hauteur du panneau : le flux ne bouge jamais,
    // même quand le panneau passe en fixed
    const syncSizes = () => {
      hslide.style.height = hpanel.offsetHeight + "px";
      if (slideDesktop.matches) {
        aboutCover.style.position = "sticky";
        aboutCover.style.top = window.innerHeight - aboutCover.offsetHeight + "px";
      } else {
        aboutCover.style.position = "";
        aboutCover.style.top = "";
      }
    };

    const onHslide = () => {
      if (!slideDesktop.matches) {
        setFixed(false);
        hpanel.style.transform = "";
        return;
      }
      const top = hslide.getBoundingClientRect().top;
      const span = window.innerHeight * 2; // distance totale de la traversée
      if (top <= 0 || top >= span) {
        // avant la phase : dans le flux, sous l'écran ; après : dans le flux, raccord exact
        setFixed(false);
        hpanel.style.transform = "";
        updateNavTheme();
        return;
      }
      setFixed(true);
      const x = (top / span) * 100; // 100vw → 0, linéaire = réponse directe au scroll
      hpanel.style.transform = `translateX(${x}vw)`;
      updateNavTheme(); // resynchronise le thème de la nav sur l'état tout juste posé
    };

    syncSizes();
    onHslide();
    onScrollFrame(onHslide);
    window.addEventListener("resize", () => {
      syncSizes();
      onHslide();
    });
    if (slideDesktop.addEventListener) {
      slideDesktop.addEventListener("change", () => {
        syncSizes();
        onHslide();
      });
    }
    if ("ResizeObserver" in window) {
      const roSlide = new ResizeObserver(() => {
        syncSizes();
        onHslide();
      });
      roSlide.observe(hpanel);
      roSlide.observe(aboutCover);
    }
  }

  /* ---------------- Compétences : entrée échelonnée des 4 cartes ----------------
     Rejoue à chaque passage. Les setTimeout de la cascade en cours sont
     annulés à chaque changement d'état pour éviter qu'un ajout tardif ne
     vienne rallumer une carte juste après un retrait (allers-retours rapides). */
  const svcGrid = document.querySelector(".panel--light .services__grid");
  const svcCards = svcGrid ? Array.from(svcGrid.querySelectorAll("[data-svc]")) : [];
  if (svcCards.length) {
    let svcTimers = [];
    const clearSvcTimers = () => {
      svcTimers.forEach(clearTimeout);
      svcTimers = [];
    };
    const playSvcIn = () => {
      clearSvcTimers();
      svcCards.forEach((card, i) => {
        svcTimers.push(setTimeout(() => card.classList.add("is-in"), i * 120));
      });
    };
    const playSvcOut = () => {
      clearSvcTimers();
      svcCards.forEach((card) => card.classList.remove("is-in"));
    };
    if ("IntersectionObserver" in window && !reduceMotion) {
      const ioSvc = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) playSvcIn();
            else playSvcOut();
          });
        },
        { threshold: 0.3 }
      );
      ioSvc.observe(svcGrid);
    } else {
      svcCards.forEach((card) => card.classList.add("is-in"));
    }
  }

  /* ---------------- Mot géant "Expertises" : parallaxe horizontale ---------------- */
  const servicesGhost = document.getElementById("servicesGhost");
  if (servicesGhost && !reduceMotion) {
    const ghostSection = servicesGhost.parentElement;
    const moveGhost = () => {
      const r = ghostSection.getBoundingClientRect();
      // progression 0 → 1 de la traversée de la section dans le viewport
      const p = Math.min(Math.max((window.innerHeight - r.top) / (window.innerHeight + r.height), 0), 1);
      servicesGhost.style.transform = `translateX(${(0.15 - p * 0.3) * 100}vw)`;
    };
    onScrollFrame(moveGhost);
    moveGhost();
  }

  /* ---------------- Hacker scramble on footer links ---------------- */
  const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=<>/";
  document.querySelectorAll("[data-scramble]").forEach((el) => {
    const original = el.textContent;
    let frame = null;
    let tick = 0;

    const scramble = () => {
      tick++;
      // ~30 frames de brouillage complet, puis un caractère résolu tous les 12 frames
      const resolved = Math.max(0, Math.floor((tick - 30) / 12));
      let out = "";
      for (let i = 0; i < original.length; i++) {
        const ch = original[i];
        if (ch === " " || ch === " " || i < resolved) {
          out += ch;
        } else {
          out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
      }
      el.textContent = out;
      if (resolved < original.length) {
        frame = requestAnimationFrame(scramble);
      } else {
        el.textContent = original;
      }
    };

    el.addEventListener("mouseenter", () => {
      if (reduceMotion) return;
      // fige la largeur pour éviter tout tremblement de mise en page
      el.style.minWidth = el.offsetWidth + "px";
      cancelAnimationFrame(frame);
      tick = 0;
      frame = requestAnimationFrame(scramble);
    });
    el.addEventListener("mouseleave", () => {
      cancelAnimationFrame(frame);
      el.textContent = original;
    });
  });

  /* ---------------- Custom glass cursor ---------------- */
  if (isFinePointer && !reduceMotion) {
    const cursor = document.querySelector(".cursor");
    const dot = document.querySelector(".cursor__dot");
    const ring = document.querySelector(".cursor__ring");
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;

    // Position posée en transform, pas en left/top : ces deux propriétés
    // relayoutent la page à chaque frame. Le -50% reproduit le centrage que
    // le CSS appliquait, qu'on écrase ici.
    // scale() reprend --ring-scale (interpolée en CSS) : l'anneau grossit au
    // survol sans toucher à width/height, qui relayouteraient. Le repli à 1
    // garde le curseur fonctionnel si @property n'est pas gérée.
    const place = (el, x, y) =>
      (el.style.transform =
        `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(var(--ring-scale, 1))`);

    let loopId = null;
    const loop = () => {
      ringX += (mouseX - ringX) * 0.16;
      ringY += (mouseY - ringY) * 0.16;
      place(ring, ringX, ringY);
      // La boucle tournait indéfiniment, y compris souris immobile et anneau
      // déjà arrivé. On l'arrête une fois l'écart négligeable ; le prochain
      // mouvement la relance.
      if (Math.abs(mouseX - ringX) < 0.1 && Math.abs(mouseY - ringY) < 0.1) {
        place(ring, mouseX, mouseY);
        loopId = null;
        return;
      }
      loopId = requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      place(dot, mouseX, mouseY);
      if (loopId === null) loopId = requestAnimationFrame(loop);
    });

    place(dot, mouseX, mouseY);
    place(ring, ringX, ringY);

    document.querySelectorAll("a, button, [data-tilt]").forEach((el) => {
      el.addEventListener("mouseenter", () => cursor.classList.add("is-active"));
      el.addEventListener("mouseleave", () => cursor.classList.remove("is-active"));
    });
  } else {
    const cursorEl = document.querySelector(".cursor");
    if (cursorEl) cursorEl.style.display = "none";
  }

  /* ---------------- Parallaxe douce ----------------
     Les décalages sont calculés à partir de positions MESURÉES UNE FOIS (et
     re-mesurées au redimensionnement) : lire getBoundingClientRect à chaque
     frame forcerait un calcul de mise en page par élément et par frame. */
  const parallaxEls = [...document.querySelectorAll("[data-parallax]")];
  if (parallaxEls.length && !reduceMotion) {
    let mesures = [];
    const mesurer = () => {
      mesures = parallaxEls.map((el) => {
        const prev = el.style.transform;
        el.style.transform = "none";
        const r = el.getBoundingClientRect();
        el.style.transform = prev;
        return {
          el,
          centre: r.top + window.scrollY + r.height / 2,
          amp: parseFloat(el.dataset.parallax) || 14,
        };
      });
    };
    const appliquer = () => {
      const vh = window.innerHeight;
      const y = window.scrollY + vh / 2;
      for (let i = 0; i < mesures.length; i++) {
        const m = mesures[i];
        const p = Math.max(-1, Math.min(1, (m.centre - y) / vh));
        m.el.style.transform = `translate3d(0, ${(p * m.amp).toFixed(1)}px, 0)`;
      }
    };
    mesurer();
    appliquer();
    onScrollFrame(appliquer);
    window.addEventListener("resize", () => {
      mesurer();
      appliquer();
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(mesurer);
  }

  /* ---------------- Boutons magnétiques ----------------
     Le bouton s'incline vers le pointeur puis revient. Même discipline que le
     basculement des cartes : rectangle mis en cache à l'entrée, transform
     seul, et transition rétablie pour le retour. */
  if (isFinePointer && !reduceMotion) {
    document.querySelectorAll("[data-magnet]").forEach((el) => {
      let r = null;
      let frame = null;
      let mx = 0;
      let my = 0;
      const poser = () => {
        frame = null;
        el.style.transform = `translate3d(${mx.toFixed(1)}px, ${my.toFixed(1)}px, 0)`;
      };
      el.addEventListener("mouseenter", () => {
        r = el.getBoundingClientRect();
        el.style.transition = "none";
      });
      el.addEventListener("mousemove", (e) => {
        if (!r) r = el.getBoundingClientRect();
        mx = (e.clientX - (r.left + r.width / 2)) * 0.22;
        my = (e.clientY - (r.top + r.height / 2)) * 0.28;
        if (frame === null) frame = requestAnimationFrame(poser);
      });
      el.addEventListener("mouseleave", () => {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        r = null;
        el.style.transition = "";
        el.style.transform = "";
      });
    });
  }

  /* ---------------- Glass card tilt ---------------- */
  if (isFinePointer && !reduceMotion) {
    document.querySelectorAll("[data-tilt]").forEach((card) => {
      let raf = null;
      let rect = null;
      let settle = null;
      let lastX = 0;
      let lastY = 0;

      const apply = () => {
        raf = null;
        card.style.transform =
          `perspective(900px) rotateX(${-lastY * 6}deg) rotateY(${lastX * 8}deg) translateY(-4px)`;
        card.style.setProperty("--sx", ((lastX + 0.5) * 100).toFixed(1) + "%");
        card.style.setProperty("--sy", ((lastY + 0.5) * 100).toFixed(1) + "%");
      };

      card.addEventListener("mouseenter", () => {
        // Rectangle mesuré une seule fois à l'entrée. Il était relu à CHAQUE
        // mousemove : getBoundingClientRect force un calcul de mise en page
        // synchrone, soit des dizaines de layouts par seconde pendant tout le
        // survol — la principale source du retard ressenti.
        rect = card.getBoundingClientRect();
        // .is-tilting n'est PAS posée tout de suite : elle coupe la transition,
        // et la carte basculerait alors d'un coup sous le pointeur dès la
        // première frame. On laisse d'abord la transition CSS amener
        // l'inclinaison en douceur, puis on passe au suivi direct une fois
        // qu'elle est arrivée — entrée douce, puis collée au curseur.
        clearTimeout(settle);
        settle = setTimeout(() => card.classList.add("is-tilting"), 340);
      });

      card.addEventListener("mousemove", (e) => {
        if (!rect) rect = card.getBoundingClientRect();
        lastX = (e.clientX - rect.left) / rect.width - 0.5;
        lastY = (e.clientY - rect.top) / rect.height - 0.5;
        if (raf === null) raf = requestAnimationFrame(apply);
      });

      card.addEventListener("mouseleave", () => {
        if (raf !== null) {
          cancelAnimationFrame(raf);
          raf = null;
        }
        clearTimeout(settle);
        rect = null;
        // la transition reprend pour le retour à plat, puis le CSS
        // (:hover lift, reveal) récupère la main
        card.classList.remove("is-tilting");
        card.style.transform = "";
      });
    });
  }
})();
