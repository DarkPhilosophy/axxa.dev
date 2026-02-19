/**
 * AXXA.DEV Main Script
 * Handles Dynamic Config Loading, Admin Interface, and Interactions
 */

let baseConfig = {};
let siteConfig = {};
let currentLang = 'ro';
const writingListState = {
    query: '',
    page: 1,
    pageSize: 12,
};
let revealObserver = null;
let adminUnlocked = false;
let sessionGithubToken = null;
let activeOverlay = null;
let timeTicker = null;
let softNavBound = false;
let softNavLoading = false;

document.addEventListener('DOMContentLoaded', async () => {
    if (normalizeHomeHashRouting()) return;
    await bootApp();
    handleSectionQueryRouting();
    initSoftNavigation();
});

function handleSectionQueryRouting() {
    const url = new URL(window.location.href);
    const section = (url.searchParams.get('section') || '').toLowerCase();
    if (!section) return;

    const sectionMap = {
        home: 'home',
        about: 'about',
        services: 'services',
        experience: 'experience',
        experienta: 'experience',
        testimonials: 'testimonials',
        customer: 'testimonials'
    };
    const targetId = sectionMap[section];
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const cleanPath = `/${section}`;
    history.replaceState({}, '', cleanPath);
}

async function bootApp() {
    try {
        // 1. Load Config
        await loadConfig();

        // 2. Initialize UI Logic
        initSplash();
        initTheme();
        initNavigation();
        initAnimations();
        initMouseSpotlight();
        initModals();
        initAdmin();
        initContact();
        initBlog();
        updateTime();
        if (timeTicker) clearInterval(timeTicker);
        timeTicker = setInterval(updateTime, 60000);
    } catch (error) {
        console.error("Initialization error:", error);
    } finally {
        // 3. Hide Preloader (Always)
        const preloader = document.getElementById('preloader');
        if (preloader) {
            // Ensure connection to DOM before trying to remove
            if(document.body.contains(preloader)) {
                preloader.style.opacity = '0';
                setTimeout(() => {
                    if(document.body.contains(preloader)) preloader.remove();
                }, 500);
            }
        }
    }
}

// Fallback: Force remove preloader after 5 seconds max
setTimeout(() => {
    const preloader = document.getElementById('preloader');
    if (preloader && document.body.contains(preloader)) {
        preloader.remove();
    }
}, 5000);

// --- CORE: CONFIG LOADER ---
async function loadConfig() {
    try {
        const response = await fetch('/config.json');
        baseConfig = await response.json();

        initI18n();
        applyLanguage(currentLang);
        
        console.log('Config loaded successfully');
    } catch (error) {
        console.error('Failed to load config:', error);
        showToast('Error loading configuration', 'error');
    }
}

function initI18n() {
    const i18n = baseConfig.i18n || {};
    const supported = getSupportedLangs();
    const fallback = (i18n.fallback || i18n.default || supported[0] || 'ro').toLowerCase();
    const saved = localStorage.getItem('axxa_lang');
    const browser = navigator.language || navigator.userLanguage || '';

    currentLang = normalizeLang(saved || browser || fallback, supported, fallback);
    if (!saved) {
        localStorage.setItem('axxa_lang', currentLang);
    }

    bindLanguageMenu();
    updateLanguageUI();
}

function getSupportedLangs() {
    const supported = baseConfig.i18n?.supported;
    if (Array.isArray(supported) && supported.length > 0) {
        return supported.map(l => String(l).toLowerCase());
    }
    return ['ro', 'en'];
}

function normalizeLang(lang, supported, fallback) {
    const lc = String(lang || '').toLowerCase();
    if (supported.includes(lc)) return lc;
    const short = lc.split('-')[0];
    if (supported.includes(short)) return short;
    return fallback;
}

function bindLanguageMenu() {
    const menuBtn = document.getElementById('lang-menu-btn');
    const menu = document.getElementById('lang-menu');

    if (menuBtn && menu) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== menuBtn) {
                menu.classList.add('hidden');
            }
        });
    }

    document.querySelectorAll('.lang-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const lang = btn.getAttribute('data-lang');
            if (lang) setLanguage(lang);
            if (menu) menu.classList.add('hidden');
        });
    });
}

function setLanguage(lang) {
    const supported = getSupportedLangs();
    const fallback = (baseConfig.i18n?.fallback || baseConfig.i18n?.default || supported[0] || 'ro').toLowerCase();
    const normalized = normalizeLang(lang, supported, fallback);
    if (normalized === currentLang) return;
    currentLang = normalized;
    localStorage.setItem('axxa_lang', currentLang);
    applyLanguage(currentLang);
}

function applyLanguage(lang) {
    const translations = baseConfig.translations?.[lang] || {};
    siteConfig = deepMerge(baseConfig, translations);
    document.documentElement.setAttribute('lang', lang);

    populateText();
    populateLists();
    renderWritingList();
    updateGithubSavedState();
    observeRevealElements();
    revealVisibleNow();
    updateTime();
    updateLanguageUI();
}

function updateLanguageUI() {
    const menuBtn = document.getElementById('lang-menu-btn');
    if (menuBtn) {
        menuBtn.textContent = currentLang.toUpperCase();
    }
    document.querySelectorAll('.lang-option').forEach(btn => {
        const lang = btn.getAttribute('data-lang');
        btn.classList.toggle('text-primary', lang === currentLang);
    });
}

function populateText() {
    // 1. Text Content (data-i18n)
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const value = getNestedValue(siteConfig, key);
        if (value !== null && value !== undefined) {
            if (el.tagName === 'META') {
                // Special case for meta tags? No, usually handled by attributes, but let's see.
                // Actually meta tags use content attribute usually.
                // Re-reading HTML: <title data-i18n="meta.title">...
                el.textContent = value;
            } else if (el.classList.contains('nav-link') || el.classList.contains('mobile-link')) {
                el.textContent = String(value).replace(/<[^>]*>/g, '');
            } else {
                el.innerHTML = value; // Use innerHTML to allow simple span tags like <br>
            }
        }
    });

    // 2. Attributes (data-i18n-attr="attr:key")
    document.querySelectorAll('[data-i18n-attr]').forEach(el => {
        const mapping = el.getAttribute('data-i18n-attr');
        const [attr, key] = mapping.split(':');
        const value = getNestedValue(siteConfig, key);
        if (value !== null && value !== undefined) {
            el.setAttribute(attr, value);
        }
    });
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((o, i) => (o ? o[i] : null), obj);
}

function populateLists() {
    // Services
    if (siteConfig.services?.items) {
        const container = document.getElementById('services-grid');
        if (container) {
            container.innerHTML = siteConfig.services.items.map(item => `
                <div class="p-8 rounded-2xl bg-white dark:bg-surface border border-slate-200 dark:border-white/5 hover:border-primary/50 transition-colors group reveal-on-scroll">
                    <div class="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                        <i class="${item.icon} text-2xl text-primary"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-3">${item.title}</h3>
                    <p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">${item.desc}</p>
                </div>
            `).join('');
        }
    }

    // Experience
    if (siteConfig.experience?.items) {
        const container = document.getElementById('experience-list');
        if (container) {
            container.innerHTML = siteConfig.experience.items.map(item => `
                <div class="relative pl-8 md:pl-0 reveal-on-scroll">
                    <div class="hidden md:block absolute left-[-60px] top-0 text-right w-40 pr-6 pt-1 z-20">
                        <span class="text-primary font-mono font-bold bg-primary/10 px-2 py-1 rounded inline-block text-xs">${item.year}</span>
                    </div>
                    
                    <div class="absolute left-[-5px] top-6 w-3 h-3 rounded-full bg-primary shadow-[0_0_10px_rgba(0,255,136,0.5)] z-10 border border-black"></div>
                    
                    <div class="bg-white dark:bg-surface p-6 rounded-2xl border border-slate-200 dark:border-white/5 hover:border-primary/30 transition-all duration-300 hover:transform hover:translate-x-2 shadow-sm dark:shadow-none">
                        <div class="md:hidden text-primary font-mono font-bold text-xs mb-2 inline-block bg-primary/10 px-2 py-1 rounded">${item.year}</div>
                        <h3 class="text-xl font-bold mb-1 text-slate-800 dark:text-white">${item.role}</h3>
                        <div class="text-sm text-slate-500 mb-4 font-bold">${item.company}</div>
                        <p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed border-l-2 border-slate-100 dark:border-white/10 pl-4">
                            ${item.desc}
                        </p>
                    </div>
                </div>
            `).join('');
        }
    }

    // Projects (Plus Filters)
    if (siteConfig.projects) {
        // Filters
        const filterContainer = document.getElementById('project-filters');
        if (filterContainer && siteConfig.projects.filters) {
            const filters = siteConfig.projects.filters;
            // Static "All" plus dynamic
            let btns = `<button class="filter-btn active px-6 py-2 rounded-full border border-primary bg-primary/10 text-primary text-sm font-bold transition-all whitespace-nowrap" data-filter="all">${filters.all || 'All'}</button>`;
            
            Object.keys(filters).forEach(key => {
                if(key !== 'all') {
                    btns += `<button class="filter-btn px-6 py-2 rounded-full border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-primary hover:text-primary text-sm font-bold transition-all whitespace-nowrap" data-filter="${key}">${filters[key]}</button>`;
                }
            });
            filterContainer.innerHTML = btns;
            
            // Re-bind listeners for filters (since we replaced HTML)
            initProjectFilters(); 
        }

        // Items
        if (siteConfig.projects.items) {
            const container = document.getElementById('projects-grid');
            if (container) {
                container.innerHTML = siteConfig.projects.items.map(item => `
                    <div class="project-card group relative bg-white dark:bg-surface rounded-3xl overflow-hidden border border-slate-200 dark:border-white/5 reveal-on-scroll" data-cat="${item.filter_cat}">
                        <div class="relative h-64 overflow-hidden">
                            <div class="absolute inset-0 bg-dark/20 group-hover:bg-dark/0 transition-colors z-10"></div>
                            <img src="${item.image}" alt="${item.title}" class="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700">
                            
                             <div class="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <button class="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg" onclick="openProjectModal('${item.id}')">
                                    <i class="fas fa-arrow-up-right-from-square transform rotate-45"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="p-6 relative z-20 bg-white dark:bg-surface">
                            <div class="text-xs font-bold text-primary uppercase tracking-wider mb-2">${item.category}</div>
                            <h3 class="text-2xl font-bold mb-2 group-hover:text-primary transition-colors">${item.title}</h3>
                            <p class="text-slate-500 text-sm line-clamp-2">${item.desc}</p>
                        </div>
                    </div>
                `).join('');
            }
        }
    }
    
    // Writing
    if(siteConfig.writing?.items) {
        const container = document.getElementById('writing-grid');
        if (container) {
            const readLabel = getNestedValue(siteConfig, 'writing.read_more') || 'READ ARTICLE';
            container.innerHTML = siteConfig.writing.items.map(item => `
                 <a href="#article-${item.id}" onclick="openArticle('${item.id}'); return false;" class="group block bg-white dark:bg-surface border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden hover:border-primary/50 transition-all reveal-on-scroll">
                     <div class="h-48 overflow-hidden relative">
                         <img src="${item.image}" alt="${item.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                         <div class="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white border border-white/10">
                             ${item.category}
                         </div>
                     </div>
                     <div class="p-6">
                         <h3 class="text-xl font-bold mb-3 leading-tight group-hover:text-primary transition-colors">${item.title}</h3>
                         <p class="text-slate-500 text-sm line-clamp-2">${item.excerpt}</p>
                         <div class="mt-4 flex items-center gap-2 text-xs font-bold text-slate-400 group-hover:text-white transition-colors">
                             ${readLabel} <i class="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                         </div>
                     </div>
                 </a>
            `).join('');
        }

        renderWritingList();
    }
    
    // Testimonials
    if(siteConfig.testimonials?.items) {
        const container = document.getElementById('testimonials-grid');
        if(container) {
            container.innerHTML = siteConfig.testimonials.items.map(item => `
                 <div class="bg-white dark:bg-surface p-8 rounded-3xl border border-slate-200 dark:border-white/5 relative reveal-on-scroll">
                    <i class="fas fa-quote-left text-4xl text-primary/20 mb-6"></i>
                    <p class="text-lg text-slate-700 dark:text-slate-300 italic mb-6 leading-relaxed">
                        ${item.text}
                    </p>
                    <div class="flex items-center gap-4">
                        <img src="${item.image}" alt="${item.author}" class="w-12 h-12 rounded-full border-2 border-primary/20 object-cover object-center">
                        <div>
                            <div class="font-bold text-slate-900 dark:text-white">${item.author}</div>
                            <div class="text-xs text-primary font-bold uppercase">${item.role}</div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    observeRevealElements();
    revealVisibleNow();
}


// --- UI: SPLASH ---
function initSplash() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    const isHomePath = window.location.pathname === '/' || window.location.pathname === '/index.html';
    const seenSplash = sessionStorage.getItem('axxa_splash_seen') === '1';

    if (!isHomePath || seenSplash) {
        splash.remove();
        return;
    }
    sessionStorage.setItem('axxa_splash_seen', '1');

    // Auto-remove after delay
    setTimeout(() => {
        splash.classList.add('fade-out');
    }, 2500); // 2.5s total duration

    // Or Click/Enter
    document.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') splash.classList.add('fade-out');
    });
    splash.addEventListener('click', () => {
        splash.classList.add('fade-out');
    });
}


// --- UI: THEME ---
function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const html = document.documentElement;
    
    // Check saved
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        html.classList.add('dark');
    } else {
        html.classList.remove('dark');
    }

    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        html.classList.toggle('dark');
        if (html.classList.contains('dark')) {
            localStorage.theme = 'dark';
            toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            localStorage.theme = 'light';
            toggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
        }
    });
}


// --- UI: NAVIGATION & SCROLL ---
function initNavigation() {
    // Mobile Menu
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    const close = document.getElementById('close-menu');
    const links = document.querySelectorAll('.mobile-link');

    const toggleMenu = (show) => {
        if (show) {
            menu.classList.remove('opacity-0', 'pointer-events-none');
            document.body.style.overflow = 'hidden';
        } else {
            menu.classList.add('opacity-0', 'pointer-events-none');
            document.body.style.overflow = '';
        }
    };

    if (btn && menu && close) {
        btn.addEventListener('click', () => toggleMenu(true));
        close.addEventListener('click', () => toggleMenu(false));
        links.forEach(l => l.addEventListener('click', () => toggleMenu(false)));
    }

    // Scroll to Top
    const toTopBtn = document.getElementById('scrollToTopBtn');
    window.addEventListener('scroll', () => {
        if (!toTopBtn) return;
        if (window.scrollY > 500) {
            toTopBtn.classList.remove('opacity-0', 'translate-y-20');
        } else {
            toTopBtn.classList.add('opacity-0', 'translate-y-20');
        }
    });
    if (toTopBtn) {
        toTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Auto-hide topbar on scroll down, reveal on scroll up or top-edge hover.
    const nav = document.getElementById('main-nav') || document.querySelector('nav');
    if (nav) {
        let lastY = window.scrollY || 0;
        let hidden = false;
        let hoverReveal = false;
        let navHovered = false;
        nav.style.willChange = 'transform';

        const showNav = () => {
            if (!hidden) return;
            nav.style.transform = 'translateY(0)';
            document.body.classList.remove('nav-hidden');
            hidden = false;
        };

        const hideNav = () => {
            if (hidden) return;
            nav.style.transform = 'translateY(-100%)';
            document.body.classList.add('nav-hidden');
            hidden = true;
        };

        window.addEventListener('scroll', () => {
            if (activeOverlay) return;
            const y = window.scrollY || 0;
            if (y < 80) {
                showNav();
                lastY = y;
                return;
            }
            if (!hoverReveal && !navHovered && y > lastY + 6) hideNav();
            if (y < lastY - 6) showNav();
            lastY = y;
        }, { passive: true });

        nav.addEventListener('mouseenter', () => {
            if (activeOverlay) return;
            navHovered = true;
            showNav();
        });
        nav.addEventListener('mouseleave', () => {
            if (activeOverlay) return;
            navHovered = false;
            if (window.scrollY > 120 && !hoverReveal) hideNav();
        });

        document.addEventListener('mousemove', (e) => {
            if (activeOverlay) return;
            if (e.clientY <= 20) {
                hoverReveal = true;
                showNav();
                return;
            }
            hoverReveal = false;
            if (window.scrollY > 120 && !navHovered) hideNav();
        });
    }

    const setOverlayLock = (locked) => {
        const nav = document.getElementById('main-nav') || document.querySelector('nav');
        if (locked) {
            document.body.classList.add('overlay-open');
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            if (nav) {
                nav.style.transform = 'translateY(-120%)';
                nav.style.pointerEvents = 'none';
            }
        } else {
            document.body.classList.remove('overlay-open');
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
            if (nav) {
                nav.style.transform = '';
                nav.style.pointerEvents = '';
            }
        }
    };

    // Contact modal open/close hooks.
    const contactModal = document.getElementById('contact-modal');
    const contactBackdrop = document.getElementById('contact-modal-backdrop');
    const contactContent = document.getElementById('contact-modal-content');
    let closeContact = null;

    if (contactModal && contactBackdrop && contactContent) {
        const openContact = () => {
            if (activeOverlay && activeOverlay !== 'contact') return;
            activeOverlay = 'contact';
            setOverlayLock(true);
            contactModal.classList.remove('hidden');
            requestAnimationFrame(() => {
                contactBackdrop.classList.remove('opacity-0');
                contactContent.classList.remove('opacity-0', 'scale-95');
            });
        };
        closeContact = () => {
            contactBackdrop.classList.add('opacity-0');
            contactContent.classList.add('opacity-0', 'scale-95');
            setTimeout(() => {
                contactModal.classList.add('hidden');
                if (activeOverlay === 'contact') activeOverlay = null;
                setOverlayLock(false);
            }, 250);
        };
        document.addEventListener('click', (e) => {
            const opener = e.target.closest('[data-open-contact]');
            if (opener) {
                e.preventDefault();
                openContact();
                return;
            }
            const closer = e.target.closest('[data-close-contact]');
            if (closer) closeContact();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !contactModal.classList.contains('hidden')) closeContact();
        });
    }

    // SQL modal open/close hooks.
    const sqlModal = document.getElementById('sql-modal');
    const sqlBackdrop = document.getElementById('sql-modal-backdrop');
    const sqlContent = document.getElementById('sql-modal-content');
    let closeSql = null;

    if (sqlModal && sqlBackdrop && sqlContent) {
        const openSql = () => {
            if (activeOverlay && activeOverlay !== 'sql') return;
            activeOverlay = 'sql';
            setOverlayLock(true);
            sqlModal.classList.remove('hidden');
            requestAnimationFrame(() => {
                sqlBackdrop.classList.remove('opacity-0');
                sqlContent.classList.remove('opacity-0', 'scale-95');
            });
        };
        closeSql = () => {
            sqlBackdrop.classList.add('opacity-0');
            sqlContent.classList.add('opacity-0', 'scale-95');
            setTimeout(() => {
                sqlModal.classList.add('hidden');
                if (activeOverlay === 'sql') activeOverlay = null;
                setOverlayLock(false);
            }, 250);
        };
        document.addEventListener('click', (e) => {
            const opener = e.target.closest('[data-open-sql]');
            if (opener) {
                e.preventDefault();
                openSql();
                return;
            }
            const closer = e.target.closest('[data-close-sql]');
            if (closer) closeSql();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !sqlModal.classList.contains('hidden')) closeSql();
        });
    }
}

function normalizeHomeHashRouting() {
    const homeHashMap = {
        '#home': '/home',
        '#about': '/about',
        '#services': '/services',
        '#experience': '/experience',
        '#experienta': '/experienta',
        '#experiență': '/experience',
        '#testimonials': '/testimonials',
        '#customer': '/customer'
    };
    const path = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;
    const hash = window.location.hash || '';
    if ((path === '/writing/' || path === '/projects/') && homeHashMap[hash]) {
        window.location.replace(homeHashMap[hash]);
        return true;
    }
    return false;
}

function initSoftNavigation() {
    if (softNavBound) return;
    softNavBound = true;
    const sectionRouteToId = {
        '/home/': 'home',
        '/about/': 'about',
        '/services/': 'services',
        '/experience/': 'experience',
        '/experienta/': 'experience',
        '/testimonials/': 'testimonials',
        '/customer/': 'testimonials'
    };

    const isSoftPath = (url) => {
        try {
            const u = new URL(url, window.location.origin);
            const p = u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`;
            return u.origin === window.location.origin && (['/', '/projects/', '/writing/'].includes(p) || !!sectionRouteToId[p]);
        } catch {
            return false;
        }
    };

    const swapPageContent = async (url, push = true) => {
        if (softNavLoading || activeOverlay) return;
        if (!isSoftPath(url)) {
            window.location.href = url;
            return;
        }
        softNavLoading = true;
        try {
            const reqUrl = new URL(url, window.location.origin);
            const reqPath = reqUrl.pathname.endsWith('/') ? reqUrl.pathname : `${reqUrl.pathname}/`;
            const isSectionRoute = !!sectionRouteToId[reqPath];
            const fetchUrl = isSectionRoute ? '/' : url;
            const res = await fetch(fetchUrl, { credentials: 'same-origin' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const nextMain = doc.querySelector('#page-content');
            const currMain = document.querySelector('#page-content');
            if (!nextMain || !currMain) {
                window.location.href = url;
                return;
            }
            currMain.replaceWith(nextMain);
            document.title = doc.title || document.title;
            const nextDesc = doc.querySelector('meta[name="description"]');
            const currDesc = document.querySelector('meta[name="description"]');
            if (nextDesc && currDesc) currDesc.setAttribute('content', nextDesc.getAttribute('content') || '');
            if (push) history.pushState({}, '', url);
            window.scrollTo({ top: 0, behavior: 'auto' });
            const sectionId = sectionRouteToId[reqPath];
            if (sectionId) {
                const target = document.getElementById(sectionId);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (reqUrl.hash) {
                const target = document.querySelector(reqUrl.hash);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            applyLanguage(currentLang);
            initAnimations();
            initBlog();
            initContact();
        } catch (e) {
            console.error('Soft nav failed:', e);
            window.location.href = url;
        } finally {
            softNavLoading = false;
        }
    };

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-soft-nav]');
        if (!link) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const href = link.getAttribute('href');
        if (!href) return;
        e.preventDefault();
        swapPageContent(href, true);
    });

    window.addEventListener('popstate', () => {
        swapPageContent(window.location.href, false);
    });
}


// --- UI: ANIMATIONS (Observer) ---
function initAnimations() {
    if (!revealObserver) {
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
    }

    observeRevealElements();
    revealVisibleNow();
}

function observeRevealElements() {
    if (!revealObserver) return;
    document.querySelectorAll('.reveal-on-scroll').forEach(el => {
        if (el.dataset.revealBound) return;
        el.dataset.revealBound = 'true';
        revealObserver.observe(el);
    });
}

function revealVisibleNow() {
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    document.querySelectorAll('.reveal-on-scroll').forEach(el => {
        if (el.classList.contains('revealed')) return;
        const rect = el.getBoundingClientRect();
        if (rect.top < viewportH * 0.9 && rect.bottom > 0) {
            el.classList.add('revealed');
        }
    });
}


// --- PROJECT FILTERS ---
function initProjectFilters() {
    const buttons = document.querySelectorAll('.filter-btn');
    const items = document.querySelectorAll('.project-card');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Active state
            buttons.forEach(b => {
                b.classList.remove('active', 'bg-primary/10', 'border-primary', 'text-primary');
                b.classList.add('text-slate-500', 'border-slate-200', 'dark:border-white/10');
            });
            btn.classList.add('active', 'bg-primary/10', 'border-primary', 'text-primary');
            btn.classList.remove('text-slate-500', 'border-slate-200');

            const filter = btn.getAttribute('data-filter');
            
            items.forEach(item => {
                if (filter === 'all' || item.getAttribute('data-cat').includes(filter)) {
                    item.style.display = 'block';
                    setTimeout(() => {
                        item.style.opacity = '1';
                        item.style.transform = 'scale(1)';
                    }, 50);
                } else {
                    item.style.opacity = '0';
                    item.style.transform = 'scale(0.9)';
                    setTimeout(() => {
                        item.style.display = 'none';
                    }, 300);
                }
            });
        });
    });
}


// --- MODALS ---
window.openProjectModal = function(id) {
    if(!siteConfig.projects?.items) return;
    const project = siteConfig.projects.items.find(p => p.id === id);
    if (!project) return;

    const modal = document.getElementById('project-modal');
    const content = document.getElementById('modal-content');
    const backdrop = document.getElementById('modal-backdrop');

    // Populate
    document.getElementById('modal-image').src = project.image;
    document.getElementById('modal-title').textContent = project.title;
    document.getElementById('modal-category').textContent = project.category;
    document.getElementById('modal-desc').textContent = project.desc;

    // Tech stack
    const techContainer = document.getElementById('modal-tech');
    techContainer.innerHTML = project.tech.map(t => 
        `<span class="px-3 py-1 bg-slate-100 dark:bg-white/10 rounded-lg text-xs font-bold">${t}</span>`
    ).join('');

    // Open
    modal.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        content.classList.remove('opacity-0', 'scale-95');
    }, 10);
};

function initModals() {
    const modal = document.getElementById('project-modal');
    const backdrop = document.getElementById('modal-backdrop');
    const closeBtn = document.getElementById('close-modal');
    const content = document.getElementById('modal-content');

    if (!modal || !backdrop || !closeBtn || !content) return;

    const closeModal = () => {
        backdrop.classList.add('opacity-0');
        content.classList.add('opacity-0', 'scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
}


// --- ADMIN SYSTEM ---
function initAdmin() {
    const overlay = document.getElementById('admin-overlay');
    const closeBtn = document.getElementById('admin-close');
    const loginForm = document.getElementById('admin-login-form');
    const editor = document.getElementById('admin-editor');
    const passInput = document.getElementById('admin-pass');
    const loginBtn = document.getElementById('btn-admin-login');
    const errorMsg = document.getElementById('login-error');
    const saveBtn = document.getElementById('btn-save-config');
    const container = document.getElementById('json-editor-container');
    const tokenInput = document.getElementById('github-token');
    const saveTokenBtn = document.getElementById('btn-save-token');
    const testTokenBtn = document.getElementById('btn-test-token');
    const updateBtn = document.getElementById('btn-github-update');
    const statusEl = document.getElementById('github-status');
    const savedEl = document.getElementById('github-saved');
    const githubBox = document.getElementById('github-sync');
    const headerControls = document.getElementById('github-header-controls');

    if (!overlay || !closeBtn || !loginForm || !editor || !passInput || !loginBtn || !errorMsg || !saveBtn || !container) {
        return;
    }

    // 1. GitHub Sync Logic (Header Integration)
    const savedToken = localStorage.getItem('axxa_github_token');
    if (tokenInput && savedToken) tokenInput.value = savedToken;
    updateGithubSavedState();

    // Create Toggle in Header
    if (headerControls && githubBox) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'text-xs font-mono font-bold px-3 py-1 rounded border border-white/10 hover:border-primary hover:text-primary transition-all flex items-center gap-2';
        headerControls.appendChild(toggleBtn);

        const updateState = () => {
            const hasToken = !!localStorage.getItem('axxa_github_token');
            
            if (hasToken) {
                toggleBtn.innerHTML = `<span class="w-2 h-2 rounded-full bg-green-500"></span> SYNC`;
                toggleBtn.classList.add('bg-green-500/10', 'text-green-400');
            } else {
                toggleBtn.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> SETUP`;
                toggleBtn.classList.remove('bg-green-500/10', 'text-green-400');
            }
        };

        toggleBtn.addEventListener('click', () => {
            githubBox.classList.toggle('hidden');
        });

        // Initial State
        if (savedToken) {
            githubBox.classList.add('hidden');
        } else {
            githubBox.classList.remove('hidden');
        }
        updateState();
        
        // Listen for save to update UI
        window.addEventListener('token-saved', () => {
            githubBox.classList.add('hidden');
            updateState();
        });
    }

    const repoInfo = getGitHubRepoInfo();
    if (statusEl && repoInfo) {
        const msg = formatTemplate(t('admin.github.repo_note', 'Repo: {repo} (branch: {branch})'), repoInfo);
        statusEl.textContent = msg;
        statusEl.classList.remove('text-slate-400');
    }

    // Key Combo: Ctrl + Shift + L
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
            if (activeOverlay && activeOverlay !== 'admin') return;
            activeOverlay = 'admin';
            document.body.classList.add('overlay-open');
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            const nav = document.getElementById('main-nav') || document.querySelector('nav');
            if (nav) {
                nav.style.transform = 'translateY(-120%)';
                nav.style.pointerEvents = 'none';
            }
            overlay.classList.remove('hidden');
        }
    });

    closeBtn.addEventListener('click', () => {
        overlay.classList.add('hidden');
        if (activeOverlay === 'admin') activeOverlay = null;
        document.body.classList.remove('overlay-open');
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        const nav = document.getElementById('main-nav') || document.querySelector('nav');
        if (nav) {
            nav.style.transform = '';
            nav.style.pointerEvents = '';
        }
        // Reset state
        loginForm.classList.remove('hidden');
        editor.classList.add('hidden');
        passInput.value = '';
        errorMsg.classList.add('hidden');
        adminUnlocked = false;
    });

    // Login Logic
    loginBtn.addEventListener('click', () => {
        if (passInput.value === 'admin123') { // Secret Password
            loginForm.classList.add('hidden');
            editor.classList.remove('hidden');
            adminUnlocked = true;
            renderAdminEditor(baseConfig, container);
        } else {
            errorMsg.classList.remove('hidden');
            passInput.classList.add('border-red-500');
        }
    });

    // Save Logic
    saveBtn.addEventListener('click', () => {
        const text = JSON.stringify(baseConfig, null, 4);
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'config.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Configuration downloaded! Replace the file in your project.', 'success');
    });

    const setStatus = (msg, state = 'ok') => {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.classList.remove('text-slate-400');
        statusEl.classList.toggle('text-green-400', state === 'ok');
        statusEl.classList.toggle('text-red-400', state === 'error');
        statusEl.classList.toggle('text-yellow-400', state === 'warn');
    };

    saveTokenBtn?.addEventListener('click', async () => {
        const token = tokenInput?.value?.trim();
        if (!token) {
            const msg = t('admin.github.test_fail', 'Invalid token or missing permissions.');
            setStatus(msg, 'error');
            showToast(msg, 'error');
            return;
        }
        const result = await testGitHubToken(token);
        if (!result.ok) {
            const msg = t('admin.github.test_fail', 'Invalid token or missing permissions.');
            setStatus(msg, 'error');
            showToast(msg, 'error');
            return;
        }
        if (!result.repoOk) {
            const msg = t('admin.github.repo_missing', 'Token does NOT have access to this repo.');
            setStatus(msg, 'error');
            showToast(msg, 'error');
            return;
        }
        localStorage.setItem('axxa_github_token', token);
        updateGithubSavedState();
        window.dispatchEvent(new CustomEvent('token-saved'));
        
        const msg = t('admin.github.save_ok', 'Token saved.');
        setStatus(msg, 'ok');
        showToast(msg, 'success');
    });

    testTokenBtn?.addEventListener('click', async () => {
        const token = tokenInput?.value?.trim();
        if (!token) {
            const msg = t('admin.github.test_fail', 'Invalid token or missing permissions.');
            setStatus(msg, 'error');
            showToast(msg, 'error');
            return;
        }
        const result = await testGitHubToken(token);
        if (!result.ok) {
            const msg = t('admin.github.test_fail', 'Invalid token or missing permissions.');
            setStatus(msg, 'error');
            showToast(msg, 'error');
            return;
        }

        const baseMsg = t('admin.github.test_ok', 'Token is valid.');
        setStatus(baseMsg, 'ok');
        showToast(baseMsg, 'success');

        if (!result.repoOk) {
            const msg = t('admin.github.repo_missing', 'Token does NOT have access to this repo.');
            setStatus(msg, 'error');
            showToast(msg, 'error');
            return;
        }

        const repoMsg = t('admin.github.repo_ok', 'Token has access to this repo.');
        setStatus(repoMsg, 'ok');
        showToast(repoMsg, 'success');
        sessionGithubToken = token;
        updateGithubSavedState();
        window.dispatchEvent(new CustomEvent('token-saved'));

        if (result.multiRepo) {
            const warnMsg = t('admin.github.repo_warning', 'Warning: token appears to access multiple repos.');
            setStatus(warnMsg, 'warn');
            showToast(warnMsg, 'error');
        }
    });

    updateBtn?.addEventListener('click', async () => {
        if (!adminUnlocked) {
            const msg = t('admin.github.unlock_required', 'Unlock admin first.');
            setStatus(msg, 'error');
            showToast(msg, 'error');
            return;
        }
        const token = tokenInput?.value?.trim() || sessionGithubToken || savedToken;
        if (!token) {
            const msg = t('admin.github.test_fail', 'Invalid token or missing permissions.');
            setStatus(msg, 'error');
            showToast(msg, 'error');
            return;
        }
        const ok = await updateConfigOnGitHub(token);
        const msg = ok ? t('admin.github.update_ok', 'config.json updated on GitHub.') : t('admin.github.update_fail', 'Failed to update config.json.');
        setStatus(msg, ok ? 'ok' : 'error');
        showToast(msg, ok ? 'success' : 'error');
    });
}

// Recursive function to generate inputs for JSON
function renderAdminEditor(config, container) {
    container.innerHTML = '';

    // Helper to handle Details State
    const createDetails = (id, title, className = 'mb-4 bg-white/5 rounded-xl overflow-hidden group') => {
        const details = document.createElement('details');
        details.className = className;
        const isOpen = localStorage.getItem(`admin_details_${id}`) === 'true';
        if (isOpen) details.open = true;

        details.addEventListener('toggle', () => {
            localStorage.setItem(`admin_details_${id}`, details.open);
        });

        details.innerHTML = `
            <summary class="p-4 cursor-pointer font-bold text-slate-300 hover:text-white flex justify-between items-center select-none">
                <span>${title}</span>
                <span class="text-xs text-slate-500 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div class="p-4 border-t border-white/5 space-y-4" id="${id}-content"></div>
        `;
        return details;
    };

    // 1. Language Manager Section
    const langSection = document.createElement('div');
    langSection.className = 'mb-8 border-b border-white/10 pb-6';
    langSection.innerHTML = `<h3 class="text-lg font-bold text-white mb-4">Language Manager</h3>`;
    
    const langList = document.createElement('div');
    langList.className = 'flex flex-wrap gap-2 mb-4';
    renderLanguageChips(config, langList, container); 
    langSection.appendChild(langList);

    const addLangRow = document.createElement('div');
    addLangRow.className = 'flex gap-2';
    addLangRow.innerHTML = `
        <input type="text" id="new-lang-code" placeholder="New Lang (e.g. de)" class="bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-primary outline-none w-32 uppercase">
        <button id="btn-add-lang" class="bg-primary/20 hover:bg-primary/40 text-primary px-4 py-2 rounded text-sm font-bold transition-colors">Add</button>
    `;
    langSection.appendChild(addLangRow);
    container.appendChild(langSection);

    setTimeout(() => {
        document.getElementById('btn-add-lang')?.addEventListener('click', () => {
            const input = document.getElementById('new-lang-code');
            const code = input.value.trim().toLowerCase();
            if (code && !config.i18n.supported.includes(code)) {
                config.i18n.supported.push(code);
                if (!config.translations[code]) config.translations[code] = {};
                if (!config.i18n.locales) config.i18n.locales = {};
                if (!config.i18n.locales[code]) {
                    const parts = code.split('-');
                    if (parts.length === 2) {
                        config.i18n.locales[code] = `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
                    } else {
                        config.i18n.locales[code] = `${code}-${code.toUpperCase()}`;
                    }
                }
                renderAdminEditor(config, container);
                showToast(`Language '${code}' added.`, 'success');
            }
        });
    }, 0);

    // 2. Global Settings
    const settingsSection = createDetails('global-settings', '⚙️ Global Settings');
    container.appendChild(settingsSection);
    
    const globalData = {
        i18n: { ...config.i18n },
        admin: config.admin,
        contact_config: config.contact.emailjs
    };
    delete globalData.i18n.supported;
    generateFormFields(globalData, settingsSection.querySelector('#global-settings-content'), '', config);


    // 3. Default Language Content
    const defaultLang = config.i18n.default || 'ro';
    // ID 'default-content' logic will now handle persistence. Defaults to closed (false) if not in storage.
    const defaultSection = createDetails('default-content', `📝 Default Content (${defaultLang.toUpperCase()})`);
    // Override text color style from helper
    defaultSection.querySelector('summary span').className = 'font-bold text-primary hover:text-white';
    container.appendChild(defaultSection);

    const ignoredKeys = ['i18n', 'translations', 'admin'];
    const contentData = {};
    Object.keys(config).forEach(k => {
        if (!ignoredKeys.includes(k)) contentData[k] = config[k];
    });
    
    generateFormFields(contentData, defaultSection.querySelector('#default-content-content'), '', config);


    // 4. Translations
    const translationsTitle = document.createElement('h3');
    translationsTitle.className = 'text-lg font-bold text-white mt-8 mb-4';
    translationsTitle.textContent = 'Translations';
    container.appendChild(translationsTitle);

    config.i18n.supported.forEach(lang => {
        if (lang === defaultLang) return;

        const transSection = createDetails(`trans-${lang}`, `🌐 ${lang.toUpperCase()} Translation`);
        
        // Inject button into summary or content. Let's put it inside content for cleaner summary.
        const contentDiv = transSection.querySelector(`#trans-${lang}-content`);
        contentDiv.innerHTML = `
            <div class="flex justify-end mb-4">
                <button class="btn-ai-trans text-xs bg-purple-500/20 text-purple-400 hover:bg-purple-500/40 px-3 py-1 rounded border border-purple-500/30 flex items-center gap-2" data-lang="${lang}">
                    <i class="fas fa-magic"></i> Auto-Translate (${defaultLang.toUpperCase()} → ${lang.toUpperCase()})
                </button>
            </div>
            <div id="form-fields-${lang}"></div>
        `;
        
        container.appendChild(transSection);

        if (!config.translations[lang]) config.translations[lang] = {};

        generateFormFields(contentData, contentDiv.querySelector(`#form-fields-${lang}`), `translations.${lang}`, config, true);
    });

    // Bind AI Buttons
    container.querySelectorAll('.btn-ai-trans').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const lang = e.currentTarget.dataset.lang;
            realAutoTranslate(lang, defaultLang, config, container);
        });
    });
}

function renderLanguageChips(config, parent, container) {
    parent.innerHTML = '';
    const defaultLang = config.i18n.default;

    config.i18n.supported.forEach(lang => {
        const chip = document.createElement('div');
        chip.className = `flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${lang === defaultLang ? 'bg-primary/20 border-primary text-primary' : 'bg-white/10 border-white/10 text-slate-300'}`;
        chip.innerHTML = `<span>${lang.toUpperCase()}</span>`;
        
        if (lang !== defaultLang) {
            const delBtn = document.createElement('button');
            delBtn.innerHTML = '×';
            delBtn.className = 'hover:text-red-400 ml-1 text-sm';
            delBtn.onclick = () => {
                if (confirm(`Remove language '${lang}' and all its translations?`)) {
                    config.i18n.supported = config.i18n.supported.filter(l => l !== lang);
                    delete config.translations[lang];
                    if (config.i18n.locales) delete config.i18n.locales[lang];
                    renderAdminEditor(config, container);
                }
            };
            chip.appendChild(delBtn);
        }
        parent.appendChild(chip);
    });
}

// Revised Generator: Handles Schema Syncing & Advanced Array Lists
function cloneSchemaWithEmptyValues(schema) {
    if (Array.isArray(schema)) return [];
    if (schema && typeof schema === 'object') {
        const out = {};
        Object.keys(schema).forEach(k => {
            out[k] = cloneSchemaWithEmptyValues(schema[k]);
        });
        return out;
    }
    return '';
}

function cloneDeep(value) {
    return JSON.parse(JSON.stringify(value));
}

function getBasePathFromTranslation(path) {
    if (!path.startsWith('translations.')) return path;
    const parts = path.split('.');
    if (parts.length < 3) return path;
    return parts.slice(2).join('.');
}

function syncTranslationsArrayAdd(config, path, newItem) {
    const defaultLang = config.i18n?.default;
    (config.i18n?.supported || []).forEach(lang => {
        if (lang === defaultLang) return;
        const transPath = `translations.${lang}.${path}`;
        let arr = getNestedValue(config, transPath);
        if (!Array.isArray(arr)) arr = [];
        arr.push(cloneDeep(newItem));
        ensurePath(config, transPath);
        setNestedValue(config, transPath, arr);
    });
}

function syncTranslationsArrayRemove(config, path, index) {
    const defaultLang = config.i18n?.default;
    (config.i18n?.supported || []).forEach(lang => {
        if (lang === defaultLang) return;
        const transPath = `translations.${lang}.${path}`;
        let arr = getNestedValue(config, transPath);
        if (!Array.isArray(arr)) return;
        if (index >= 0 && index < arr.length) {
            arr.splice(index, 1);
            ensurePath(config, transPath);
            setNestedValue(config, transPath, arr);
        }
    });
}

function ensureTranslationArrayLength(targetConfig, path, schemaArray) {
    const desired = Array.isArray(schemaArray) ? schemaArray.length : 0;
    let arr = getNestedValue(targetConfig, path);
    if (!Array.isArray(arr)) arr = [];
    if (arr.length === desired) return arr;

    const next = [];
    for (let i = 0; i < desired; i++) {
        if (arr[i] !== undefined) next[i] = arr[i];
        else next[i] = cloneDeep(schemaArray[i] !== undefined ? schemaArray[i] : (schemaArray[0] || ''));
    }
    ensurePath(targetConfig, path);
    setNestedValue(targetConfig, path, next);
    return next;
}

function generateFormFields(schemaData, parent, prefix = '', targetConfig = baseConfig, isTranslation = false) {
    if (!parent) return; // Safety check
    parent.innerHTML = '';
    
    const build = (obj, p, currentPrefix) => {
        for (const key in obj) {
            const schemaVal = obj[key];
            const path = currentPrefix ? `${currentPrefix}.${key}` : key;
            let actualVal = getNestedValue(targetConfig, path);
            
            // Fix "null" bug: Default to empty string for text, empty array for arrays
            if (actualVal === undefined || actualVal === null) {
                if (Array.isArray(schemaVal)) actualVal = [];
                else if (typeof schemaVal === 'object') actualVal = {};
                else actualVal = '';
            }

            if (typeof schemaVal === 'object' && schemaVal !== null && !Array.isArray(schemaVal)) {
                // Nested Object
                const groupDetails = document.createElement('details');
                groupDetails.className = 'ml-2 border-l-2 border-white/5 pl-4 mb-2 group/nested';
                
                // Open root sections in default view only
                if(!isTranslation && !currentPrefix) groupDetails.open = true;

                groupDetails.innerHTML = `
                    <summary class="text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-primary list-none flex items-center gap-2 py-1">
                        ${key} <span class="opacity-0 group-hover/nested:opacity-100 transition-opacity">▼</span>
                    </summary>
                    <div class="mt-2 space-y-3" id="group-${path.replace(/\./g, '-')}"></div>
                `;
                p.appendChild(groupDetails);
                build(schemaVal, groupDetails.querySelector('div'), path);

            } else if (Array.isArray(schemaVal)) {
                // ARRAY HANDLING
                const wrapper = document.createElement('div');
                wrapper.className = 'mb-4 border border-white/5 rounded-lg p-3 bg-white/5';
                
                let schemaArray = schemaVal;
                if (isTranslation && schemaArray.length === 0) {
                    const basePath = getBasePathFromTranslation(path);
                    const baseArray = getNestedValue(baseConfig, basePath);
                    if (Array.isArray(baseArray) && baseArray.length > 0) {
                        schemaArray = baseArray;
                    }
                }

                // Detect if Array of Objects (Complex List)
                const isComplex = schemaArray.length > 0 && typeof schemaArray[0] === 'object';
                
                const labelRow = document.createElement('div');
                labelRow.className = 'flex justify-between items-center mb-3 border-b border-white/5 pb-2';
                const countVal = isTranslation ? schemaArray.length : (actualVal ? actualVal.length : 0);
                labelRow.innerHTML = `<label class="text-xs font-bold text-slate-400 uppercase">${key} (${countVal})</label>`;
                
                if (isComplex && !isTranslation) { 
                    const addBtn = document.createElement('button');
                    addBtn.className = 'text-xs bg-primary/10 text-primary px-3 py-1 rounded hover:bg-primary/20 font-bold transition-colors';
                    addBtn.innerHTML = '+ Add Item';
                    addBtn.onclick = () => {
                        const newItem = cloneSchemaWithEmptyValues(schemaArray[0] || {});
                        
                        // Generate ID if needed
                        if ('id' in newItem || !newItem.id) newItem.id = crypto.randomUUID().split('-')[0];
                        
                        if (!Array.isArray(actualVal)) actualVal = [];
                        actualVal.push(newItem);
                        ensurePath(targetConfig, path);
                        setNestedValue(targetConfig, path, actualVal);
                        syncTranslationsArrayAdd(targetConfig, path, newItem);
                        
                        // Refresh UI
                        const rootContainer = document.getElementById('json-editor-container');
                        if(rootContainer) renderAdminEditor(baseConfig, rootContainer);
                    };
                    labelRow.appendChild(addBtn);
                }
                wrapper.appendChild(labelRow);

                if (isComplex) {
                    // MENU STYLE LIST
                    const listContainer = document.createElement('div');
                    listContainer.className = 'space-y-2';
                    
                    let items = Array.isArray(actualVal) ? actualVal : [];
                    if (isTranslation) {
                        items = ensureTranslationArrayLength(targetConfig, path, schemaArray);
                    }
                    
                    if (items.length === 0) {
                        listContainer.innerHTML = `<div class="text-xs text-slate-600 italic p-2">No items yet.</div>`;
                    }

                    items.forEach((item, index) => {
                        const itemDetails = document.createElement('details');
                        itemDetails.className = 'bg-black/20 rounded-lg overflow-hidden border border-white/5 group/item';
                        
                        let itemTitle = item.title || item.name || item.role || item.id || `Item ${index + 1}`;
                        if (itemTitle.length > 40) itemTitle = itemTitle.substring(0, 40) + '...';

                        itemDetails.innerHTML = `
                            <summary class="px-3 py-2 cursor-pointer text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white flex justify-between items-center select-none">
                                <span class="flex items-center gap-2">
                                    <span class="text-xs text-slate-500 font-mono">#${index + 1}</span>
                                    <span>${itemTitle}</span>
                                </span>
                                <div class="flex items-center gap-2">
                                    ${!isTranslation ? `<button class="btn-del-item text-slate-500 hover:text-red-500 px-2 transition-colors" data-index="${index}"><i class="fas fa-trash"></i></button>` : ''}
                                    <span class="text-[10px] opacity-50 group-open/item:rotate-180 transition-transform">▼</span>
                                </div>
                            </summary>
                            <div class="p-3 border-t border-white/5 space-y-3" id="item-${path.replace(/\./g, '-')}-${index}"></div>
                        `;
                        
                        listContainer.appendChild(itemDetails);
                        
                        // Bind Delete (Default view only)
                        if (!isTranslation) {
                            itemDetails.querySelector('.btn-del-item').addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation(); // Prevent toggling details
                                if(confirm('Delete this item across all languages?')) {
                                    actualVal.splice(index, 1);
                                    ensurePath(targetConfig, path);
                                    setNestedValue(targetConfig, path, actualVal);
                                    syncTranslationsArrayRemove(targetConfig, path, index);
                                    const rootContainer = document.getElementById('json-editor-container');
                                    if(rootContainer) renderAdminEditor(baseConfig, rootContainer);
                                }
                            });
                        }

                        // Recursive Build for Item Fields
                        const itemSchema = schemaArray[0] || item;
                        generateFormFields(itemSchema, itemDetails.querySelector(`div[id^="item-"]`), `${path}.${index}`, targetConfig, isTranslation);
                    });
                    
                    wrapper.appendChild(listContainer);

                } else {
                    // JSON FALLBACK (Primitives)
                    const input = document.createElement('textarea');
                    input.className = 'w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white font-mono h-24 focus:border-primary outline-none';
                    const displayVal = actualVal !== undefined ? actualVal : [];
                    input.value = JSON.stringify(displayVal, null, 2);
                    
                    input.addEventListener('change', (e) => {
                        try {
                            const parsed = JSON.parse(e.target.value);
                            let nextVal = parsed;
                            if (isTranslation) {
                                const desired = Array.isArray(schemaVal) ? schemaVal.length : 0;
                                const arr = Array.isArray(parsed) ? parsed : [];
                                nextVal = [];
                                for (let i = 0; i < desired; i++) {
                                    nextVal[i] = arr[i] !== undefined ? arr[i] : (schemaVal[i] !== undefined ? schemaVal[i] : '');
                                }
                            }
                            ensurePath(targetConfig, path);
                            setNestedValue(targetConfig, path, nextVal);
                        } catch(err) {
                            alert('Invalid JSON for array');
                        }
                    });
                    wrapper.appendChild(input);
                }
                
                p.appendChild(wrapper);

            } else {
                // Simple Value
                const wrapper = document.createElement('div');
                const label = document.createElement('label');
                label.className = 'block text-xs text-slate-500 mb-1 capitalize';
                label.innerText = key;
                
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-primary outline-none focus:bg-white/5 transition-colors';
                
                if (isTranslation && !actualVal) {
                    input.placeholder = `(Default: ${schemaVal})`;
                    input.classList.add('placeholder-slate-600');
                }
                
                input.value = actualVal !== undefined ? actualVal : '';
                
                input.addEventListener('input', (e) => {
                    ensurePath(targetConfig, path);
                    setNestedValue(targetConfig, path, e.target.value);
                });

                wrapper.appendChild(label);
                wrapper.appendChild(input);
                p.appendChild(wrapper);
            }
        }
    };
    
    build(schemaData, parent, prefix);
}

// Helper: Create nested objects if they don't exist
function ensurePath(obj, path) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
    }
}

// Real AI Translator using Google GTX API
async function realAutoTranslate(targetLang, sourceLang, config, container) {
    if (!confirm(`Translate missing fields to '${targetLang.toUpperCase()}' using Google Translate?`)) return;

    const btn = container.querySelector(`.btn-ai-trans[data-lang="${targetLang}"]`);
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Translating...`;
    btn.disabled = true;

    // 1. Identify missing fields
    const missing = [];
    
    const findMissing = (schema, prefix) => {
        if (Array.isArray(schema)) {
            schema.forEach((item, idx) => {
                const itemPath = prefix ? `${prefix}.${idx}` : String(idx);
                findMissing(item, itemPath);
            });
            return;
        }

        if (schema && typeof schema === 'object') {
            for (const key in schema) {
                const val = schema[key];
                const path = prefix ? `${prefix}.${key}` : key;
                const targetPath = `translations.${targetLang}.${path}`;
                const currentVal = getNestedValue(config, targetPath);

                if (typeof val === 'object' && val !== null) {
                    findMissing(val, path);
                } else if (typeof val === 'string') {
                    if (!currentVal) {
                        missing.push({ path: targetPath, source: val });
                    }
                }
            }
        }
    };

    // Use default content as schema
    const ignoredKeys = ['i18n', 'translations', 'admin'];
    const contentData = {};
    Object.keys(config).forEach(k => {
        if (!ignoredKeys.includes(k)) contentData[k] = config[k];
    });

    findMissing(contentData, '');

    if (missing.length === 0) {
        showToast('No missing fields to translate.', 'info');
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    // 2. Translate Batch
    let successCount = 0;
    const translateEndpoint = 'https://contact.axxa.dev/translate';
    
    try {
        const texts = missing.map(m => m.source);
        let translations = [];

        try {
            const res = await fetch(translateEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceLang,
                    targetLang,
                    texts
                })
            });
            if (!res.ok) throw new Error(`Translate API ${res.status}`);
            const data = await res.json();
            translations = Array.isArray(data.translations) ? data.translations : [];
        } catch (e) {
            console.warn('Translate endpoint failed, falling back to direct calls.', e);
        }

        if (translations.length !== texts.length) {
            translations = [];
            for (const item of missing) {
                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(item.source)}`;
                const res = await fetch(url);
                if (!res.ok) {
                    translations.push('');
                    continue;
                }
                const data = await res.json();
                const translatedText = data && data[0] && data[0][0] && data[0][0][0] ? data[0][0][0] : '';
                translations.push(translatedText);
                await new Promise(r => setTimeout(r, 200));
            }
        }

        translations.forEach((translatedText, idx) => {
            if (!translatedText) return;
            const item = missing[idx];
            ensurePath(config, item.path);
            setNestedValue(config, item.path, translatedText);
            successCount++;
        });
        
        showToast(`Translated ${successCount} fields successfully!`, 'success');
        renderAdminEditor(config, container); // Refresh UI to show new values
        
    } catch (e) {
        console.error(e);
        showToast('Translation failed. API might be rate-limited.', 'error');
        // Still refresh to show whatever completed
        renderAdminEditor(config, container);
    } finally {
        // Button state is reset by re-render, but if error prevented render:
        if (container.contains(btn)) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// Replaces the old generateForm
function generateForm(data, parent) {
    renderAdminEditor(baseConfig, parent);
}

function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, i) => o[i], obj);
    target[last] = value;
}




function initContact() {
    const contactEndpoint = '/api/contact';

    const form = document.getElementById('contact-form');
    if (form) {
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            event.stopPropagation();

            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;

            // --- RATE LIMITING START ---
            const lastSent = localStorage.getItem('axxa_msg_ts');
            if (lastSent) {
                const now = Date.now();
                const diff = now - parseInt(lastSent);
                const cooldown = 24 * 60 * 60 * 1000; // 24 Hours

                console.log(`[RateLimit] Checked: ${lastSent}, Diff: ${diff}, Cooldown: ${cooldown}`);

                if (diff < cooldown) {
                    const remaining = cooldown - diff;
                    const hours = Math.floor(remaining / (1000 * 60 * 60));
                    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                    
                    const rateLimitMsg = formatTemplate(
                        t('contact.form.rate_limit', 'Please wait {hours}h {minutes}m before sending another message.'),
                        { hours, minutes }
                    );
                    showToast(rateLimitMsg, 'error');
                    return; // Stop execution
                }
            }
            // --- RATE LIMITING END ---

            const name = form.querySelector('[name="from_name"]').value.trim();
            const email = form.querySelector('[name="from_email"]').value.trim();
            const message = form.querySelector('[name="message"]').value.trim();
            const honeypot = form.querySelector('[name="website"]')?.value?.trim();

            const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            if (!name || name.length < 2 || name.length > 80) {
                showToast(t('contact.form.validation_name', 'Please enter your name.'), 'error');
                return;
            }
            if (!email || email.length > 120 || !emailOk) {
                showToast(t('contact.form.validation_email', 'Please enter a valid email.'), 'error');
                return;
            }
            if (!message || message.length < 10 || message.length > 5000) {
                showToast(t('contact.form.validation_message', 'Please enter a longer message.'), 'error');
                return;
            }
            if (honeypot) {
                showToast(t('contact.form.validation_spam', 'Spam detected.'), 'error');
                return;
            }

            const turnstileInput = form.querySelector('input[name="cf-turnstile-response"]');
            const turnstileToken = (turnstileInput && turnstileInput.value) || (window.turnstile && window.turnstile.getResponse && window.turnstile.getResponse()) || '';
            if (!turnstileToken) {
                showToast(t('contact.form.validation_captcha', 'Please complete the verification.'), 'error');
                return;
            }

            // Loading State (Moved after validation)
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('contact.form.sending', 'Sending...')}`;
            btn.disabled = true;
            btn.classList.add('opacity-70', 'cursor-not-allowed');

            const getBrowserInfo = () => {
                const ua = navigator.userAgent;
                let tem, M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
                if (/trident/i.test(M[1])) {
                    tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
                    return { name: 'IE', version: (tem[1] || '') };
                }
                if (M[1] === 'Chrome') {
                    tem = ua.match(/\b(OPR|Edge)\/(\d+)/);
                    if (tem != null) return { name: tem[1].replace('OPR', 'Opera'), version: tem[2] };
                }
                M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
                if ((tem = ua.match(/version\/(\d+)/i)) != null) M.splice(1, 1, tem[1]);
                return { name: M[0], version: M[1] };
            };

            const browserInfo = getBrowserInfo();
            const payload = {
                name,
                email,
                message,
                honeypot,
                time: new Date().toLocaleString(getLocaleForLang(currentLang)),
                lang: currentLang,
                user_os: navigator.userAgentData?.platform || navigator.platform,
                user_platform: navigator.platform,
                user_browser: browserInfo.name,
                user_version: browserInfo.version,
                user_referrer: document.referrer || 'Direct',
                turnstile_token: turnstileToken
            };

            fetch(contactEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
                .then(async (res) => {
                    if (!res.ok) {
                        const errText = await res.text().catch(() => '');
                        console.error('Server Error:', errText);
                        throw new Error(errText || `HTTP ${res.status}`);
                    }
                })
                .then(() => {
                    showToast(t('contact.form.send_success', 'Message sent successfully!'), 'success');
                    // Set Timestamp on Success
                    console.log(`[RateLimit] Setting timestamp: ${Date.now()}`);
                    localStorage.setItem('axxa_msg_ts', Date.now().toString());
                    form.reset();
                    if (window.turnstile && window.turnstile.reset) {
                        window.turnstile.reset();
                    }
                })
                .catch((error) => {
                    console.error('FAILED...', error);
                    showToast(t('contact.form.send_fail', 'Failed to send message. Please try again.'), 'error');
                })
                .finally(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    btn.classList.remove('opacity-70', 'cursor-not-allowed');
                });
        });
    }
}

// --- BLOG SYSTEM ---
function initBlog() {
    // 1. "View All" Button Logic
    const viewAllBtn = document.querySelector('[data-i18n="writing.link_text"]');
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('writing-list')?.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // 2. Writing list controls
    const searchInput = document.getElementById('writing-search');
    const prevBtn = document.getElementById('writing-prev');
    const nextBtn = document.getElementById('writing-next');

    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            writingListState.query = e.target.value || '';
            writingListState.page = 1;
            renderWritingList();
        }, 200));
    }

    prevBtn?.addEventListener('click', () => {
        if (writingListState.page > 1) {
            writingListState.page -= 1;
            renderWritingList();
            document.getElementById('writing-list')?.scrollIntoView({ behavior: 'smooth' });
        }
    });

    nextBtn?.addEventListener('click', () => {
        const totalPages = getWritingTotalPages();
        if (writingListState.page < totalPages) {
            writingListState.page += 1;
            renderWritingList();
            document.getElementById('writing-list')?.scrollIntoView({ behavior: 'smooth' });
        }
    });

    // 3. Article Modal Logic
    const articleModal = document.getElementById('article-modal');
    if (articleModal) {
        const closeBtn = document.getElementById('close-article');
        const backdrop = document.getElementById('article-backdrop');

        const closeArticle = () => {
            document.getElementById('article-content').classList.remove('scale-100', 'opacity-100');
            document.getElementById('article-content').classList.add('scale-95', 'opacity-0');
            backdrop.classList.remove('opacity-100');
            setTimeout(() => {
                articleModal.classList.add('hidden');
                
                toggleScrollLock(false);
                
                // Remove hash but keep scroll position
                history.pushState("", document.title, window.location.pathname + window.location.search);
            }, 300);
        };

        closeBtn?.addEventListener('click', closeArticle);
        backdrop?.addEventListener('click', closeArticle);
        
        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !articleModal.classList.contains('hidden')) {
                closeArticle();
            }
        });
    }

    // 4. Check Hash on Load
    if (window.location.hash && window.location.hash.startsWith('#article-')) {
        const articleId = window.location.hash.replace('#article-', '');
        openArticle(articleId);
    }
}

function toggleScrollLock(active) {
    if (active) {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    }
}

window.openArticle = function(id) {
    const article = siteConfig.writing?.items.find(i => i.id === id);
    if (!article) return;

    const justNowLabel = getNestedValue(siteConfig, 'writing.just_now') || 'Just now';
    const readTimeFallback = getNestedValue(siteConfig, 'writing.read_time_fallback') || '5 min read';
    const contentFallback = getNestedValue(siteConfig, 'writing.content_coming') || 'Content coming soon...';

    // Populate Data
    document.getElementById('article-img').src = article.image;
    document.getElementById('article-title').innerHTML = article.title;
    document.getElementById('article-date').textContent = article.date || justNowLabel;
    document.getElementById('article-read').textContent = article.read_time || readTimeFallback;
    document.getElementById('article-body').innerHTML = article.content || `<p>${contentFallback}</p>`;

    // Show Modal
    const modal = document.getElementById('article-modal');
    modal.classList.remove('hidden');
    // No need for zIndex hack if CSS class is correct
    
    toggleScrollLock(true);

    void modal.offsetWidth;

    document.getElementById('article-backdrop').classList.add('opacity-100');
    const content = document.getElementById('article-content');
    content.classList.remove('scale-95', 'opacity-0');
    content.classList.add('scale-100', 'opacity-100');

    // Update Hash
    history.pushState(null, null, `#article-${id}`);
}


function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString(getLocaleForLang(currentLang), { hour: '2-digit', minute: '2-digit' });
    document.querySelectorAll('.local-time').forEach(el => el.textContent = timeString);
    const yearEl = document.getElementById('year');
    if(yearEl) yearEl.textContent = now.getFullYear();
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `p-4 rounded-xl shadow-xl border backdrop-blur-md flex items-center gap-3 text-sm font-bold min-w-[300px] toast-enter ${type === 'error' ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-primary/10 border-primary text-primary'}`;
    toast.innerHTML = `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> <span>${msg}</span>`;
    
    container.appendChild(toast);
    
    // Force reflow
    void toast.offsetWidth;
    toast.classList.add('toast-enter-active');

    setTimeout(() => {
        toast.classList.remove('toast-enter-active');
        toast.classList.add('toast-exit-active');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function testGitHubToken(token) {
    try {
        const res = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });
        if (!res.ok) return { ok: false, repoOk: false, broadToken: false };

        const repoInfo = getGitHubRepoInfo();
        if (!repoInfo) return { ok: true, repoOk: false, multiRepo: false };

        const repoRes = await fetch(`https://api.github.com/repos/${repoInfo.repo}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });

        let multiRepo = false;
        const reposRes = await fetch('https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });
        if (reposRes.ok) {
            const repos = await reposRes.json();
            if (Array.isArray(repos)) {
                // Filter out the current target repo (case-insensitive)
                const otherRepos = repos.filter(r => r.full_name.toLowerCase() !== repoInfo.repo.toLowerCase());
                
                // Check if Classic or Fine-grained
                const scopes = reposRes.headers.get('x-oauth-scopes');
                const isClassic = scopes !== null; // Header missing usually means Fine-grained

                let riskyRepos = [];

                if (isClassic) {
                    // Classic Token: API permissions are generally accurate for the token.
                    // Risk: Write/Admin on ANY other repo OR access to PRIVATE repos.
                    riskyRepos = otherRepos.filter(r => {
                        const isPrivate = r.private;
                        const hasWrite = r.permissions?.admin || r.permissions?.push || r.permissions?.maintain;
                        return isPrivate || hasWrite;
                    });
                } else {
                    // Fine-Grained Token: API often reports USER permissions (Admin) for owned Public repos,
                    // masking the true Token permissions. We cannot trust 'hasWrite' for Public repos here.
                    // Risk: Access to ANY other PRIVATE repo.
                    riskyRepos = otherRepos.filter(r => r.private);
                }

                multiRepo = riskyRepos.length > 0;
                
                if (multiRepo) {
                    console.warn("Token warns: Risky access to:", riskyRepos.map(r => r.full_name));
                }
            }
        }

        return { ok: true, repoOk: repoRes.ok, multiRepo };
    } catch (e) {
        console.error('Token test failed', e);
        return { ok: false, repoOk: false, multiRepo: false };
    }
}

async function updateConfigOnGitHub(token) {
    const repoInfo = getGitHubRepoInfo();
    if (!repoInfo) return false;
    const repo = repoInfo.repo;
    const branch = repoInfo.branch;
    const path = 'config.json';
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;

    try {
        const getRes = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });
        if (!getRes.ok) return false;
        const file = await getRes.json();

        const content = JSON.stringify(baseConfig, null, 4);
        const encoded = btoa(unescape(encodeURIComponent(content)));
        const message = `Update config.json via admin (${new Date().toISOString()})`;

        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                content: encoded,
                sha: file.sha,
                branch
            })
        });

        return putRes.ok;
    } catch (e) {
        console.error('GitHub update failed', e);
        return false;
    }
}

function getGitHubRepoInfo() {
    const metaRepo = document.querySelector('meta[name="github-repo"]')?.getAttribute('content');
    const metaBranch = document.querySelector('meta[name="github-branch"]')?.getAttribute('content') || 'master';
    if (!metaRepo || !metaRepo.includes('/')) return null;
    return { repo: metaRepo, branch: metaBranch };
}

function updateGithubSavedState() {
    const savedEl = document.getElementById('github-saved');
    if (!savedEl) return;
    const savedToken = localStorage.getItem('axxa_github_token');
    const msg = savedToken ? t('admin.github.saved_state_ok', 'Token saved locally.') : t('admin.github.saved_state', 'Token not saved.');
    savedEl.textContent = msg;
}

function initMouseSpotlight() {
    const spotlight = document.getElementById('mouse-spotlight');
    if (!spotlight) return;

    let rafId = null;
    const update = (x, y) => {
        spotlight.style.setProperty('--spot-x', `${x}px`);
        spotlight.style.setProperty('--spot-y', `${y}px`);
    };

    const onMove = (e) => {
        if (rafId) return;
        const { clientX, clientY } = e;
        rafId = requestAnimationFrame(() => {
            update(clientX, clientY);
            rafId = null;
        });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
}

function formatTemplate(str, vars = {}) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
}

function renderWritingList() {
    const listContainer = document.getElementById('writing-list-grid');
    const pageInfo = document.getElementById('writing-page-info');
    const prevBtn = document.getElementById('writing-prev');
    const nextBtn = document.getElementById('writing-next');
    if (!listContainer || !siteConfig.writing?.items) return;

    const recentLabel = getNestedValue(siteConfig, 'writing.recent_label') || 'Recent';
    const noResultsLabel = getNestedValue(siteConfig, 'writing.no_results') || 'No articles found.';
    const pageInfoTemplate = getNestedValue(siteConfig, 'writing.page_info') || 'Page {current} of {total}';

    const query = writingListState.query.trim().toLowerCase();
    const items = siteConfig.writing.items.filter(item => {
        if (!query) return true;
        const hay = [
            item.title,
            item.excerpt,
            item.category,
            item.date,
            stripHtml(item.content || ''),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(query);
    });

    const totalPages = Math.max(1, Math.ceil(items.length / writingListState.pageSize));
    if (writingListState.page > totalPages) writingListState.page = totalPages;
    const start = (writingListState.page - 1) * writingListState.pageSize;
    const slice = items.slice(start, start + writingListState.pageSize);

    if (slice.length === 0) {
        listContainer.innerHTML = `<div class="col-span-full text-center text-slate-500 py-10">${noResultsLabel}</div>`;
    } else {
        listContainer.innerHTML = slice.map(item => `
            <a href="#article-${item.id}" onclick="openArticle('${item.id}'); return false;" class="flex gap-4 group bg-white dark:bg-surface border border-slate-200 dark:border-white/5 rounded-2xl p-4 hover:border-primary/50 transition-all reveal-on-scroll">
                <div class="w-24 h-24 shrink-0 rounded-xl overflow-hidden relative">
                    <img src="${item.image}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                </div>
                <div class="min-w-0">
                    <span class="text-xs font-bold text-primary uppercase">${item.category}</span>
                    <h4 class="font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2">${item.title}</h4>
                    <span class="text-xs text-slate-500 mt-1 block">${item.date || recentLabel}</span>
                </div>
            </a>
        `).join('');
    }

    if (pageInfo) {
        pageInfo.textContent = formatTemplate(pageInfoTemplate, {
            current: writingListState.page,
            total: totalPages,
        });
    }
    if (prevBtn) prevBtn.disabled = writingListState.page <= 1;
    if (nextBtn) nextBtn.disabled = writingListState.page >= totalPages;

    observeRevealElements();
    revealVisibleNow();
}

function getWritingTotalPages() {
    if (!siteConfig.writing?.items) return 1;
    const query = writingListState.query.trim().toLowerCase();
    const count = siteConfig.writing.items.filter(item => {
        if (!query) return true;
        const hay = [
            item.title,
            item.excerpt,
            item.category,
            item.date,
            stripHtml(item.content || ''),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(query);
    }).length;
    return Math.max(1, Math.ceil(count / writingListState.pageSize));
}

function stripHtml(html) {
    return String(html).replace(/<[^>]*>/g, ' ');
}

function debounce(fn, wait) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

function deepMerge(base, override) {
    if (Array.isArray(override)) return override.slice();
    if (override && typeof override === 'object') {
        const result = Array.isArray(base) ? [] : { ...(base || {}) };
        Object.keys(override).forEach(key => {
            result[key] = deepMerge(base ? base[key] : undefined, override[key]);
        });
        return result;
    }
    return override !== undefined ? override : base;
}

function getLocaleForLang(lang) {
    const localeMap = baseConfig.i18n?.locales || {};
    return localeMap[lang] || localeMap[currentLang] || 'ro-RO';
}

function t(path, fallback = '') {
    const val = getNestedValue(siteConfig, path);
    if (val === null || val === undefined) return fallback;
    return val;
}
