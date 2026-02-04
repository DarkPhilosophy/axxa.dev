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

document.addEventListener('DOMContentLoaded', async () => {
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
        setInterval(updateTime, 60000);
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
});

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
        const response = await fetch('config.json');
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

    btn.addEventListener('click', () => toggleMenu(true));
    close.addEventListener('click', () => toggleMenu(false));
    links.forEach(l => l.addEventListener('click', () => toggleMenu(false)));

    // Scroll to Top
    const toTopBtn = document.getElementById('scrollToTopBtn');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 500) {
            toTopBtn.classList.remove('opacity-0', 'translate-y-20');
        } else {
            toTopBtn.classList.add('opacity-0', 'translate-y-20');
        }
    });
    toTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

    // 1. GitHub Sync Logic (Header Integration)
    const savedToken = localStorage.getItem('axxa_github_token');
    if (tokenInput && savedToken) tokenInput.value = savedToken;
    updateGithubSavedState();

    // Create Toggle in Header
    if (headerControls && githubBox) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'text-xs font-mono font-bold px-3 py-1 rounded border border-white/10 hover:border-primary hover:text-primary transition-all flex items-center gap-2';
        headerControls.appendChild(toggleBtn);

        const updateState = (forceExpand = false) => {
            const hasToken = !!localStorage.getItem('axxa_github_token');
            const isExpanded = !githubBox.classList.contains('hidden');
            
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
            overlay.classList.remove('hidden');
        }
    });

    closeBtn.addEventListener('click', () => {
        overlay.classList.add('hidden');
        // Reset state
        loginForm.classList.remove('hidden');
        editor.classList.add('hidden');
        passInput.value = '';
        errorMsg.classList.add('hidden');
        adminUnlocked = false;
    });

    // Login Logic
    loginBtn.addEventListener('click', () => {
        // Simple hardcoded check for demonstration "secret menu"
        // In a real app, this would be server-side or at least hashed.
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
                    renderAdminEditor(config, container);
                }
            };
            chip.appendChild(delBtn);
        }
        parent.appendChild(chip);
    });
}

// Revised Generator: Handles Schema Syncing & Advanced Array Lists
function generateFormFields(schemaData, parent, prefix = '', targetConfig = baseConfig, isTranslation = false) {
    parent.innerHTML = '';
    
    const build = (obj, p, currentPrefix) => {
        for (const key in obj) {
            const schemaVal = obj[key];
            const path = currentPrefix ? `${currentPrefix}.${key}` : key;
            let actualVal = getNestedValue(targetConfig, path);
            
            if (isTranslation && actualVal === undefined) actualVal = '';

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
                wrapper.className = 'mb-4';
                
                // Detect if Array of Objects (Complex List)
                const isComplex = schemaVal.length > 0 && typeof schemaVal[0] === 'object';
                
                const labelRow = document.createElement('div');
                labelRow.className = 'flex justify-between items-center mb-2';
                labelRow.innerHTML = `<label class="text-xs font-bold text-slate-400 uppercase">${key} (${actualVal ? actualVal.length : 0})</label>`;
                
                if (isComplex && !isTranslation) { 
                    const addBtn = document.createElement('button');
                    addBtn.className = 'text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20';
                    addBtn.innerHTML = '+ Add Item';
                    addBtn.onclick = () => {
                        const newItem = JSON.parse(JSON.stringify(schemaVal[0] || {}));
                        Object.keys(newItem).forEach(k => newItem[k] = "");
                        if ('id' in newItem) newItem.id = crypto.randomUUID().split('-')[0];
                        
                        if (!Array.isArray(actualVal)) actualVal = [];
                        actualVal.push(newItem);
                        ensurePath(targetConfig, path);
                        setNestedValue(targetConfig, path, actualVal);
                        
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
                    
                    const items = Array.isArray(actualVal) ? actualVal : [];
                    
                    items.forEach((item, index) => {
                        const itemDetails = document.createElement('details');
                        itemDetails.className = 'bg-white/5 rounded-lg overflow-hidden border border-white/5';
                        
                        let itemTitle = item.title || item.name || item.role || item.id || `Item ${index + 1}`;
                        if (itemTitle.length > 30) itemTitle = itemTitle.substring(0, 30) + '...';

                        itemDetails.innerHTML = `
                            <summary class="px-3 py-2 cursor-pointer text-sm font-medium text-slate-300 hover:bg-white/5 flex justify-between items-center">
                                <span>${index + 1}. ${itemTitle}</span>
                                <div class="flex items-center gap-2">
                                    ${!isTranslation ? `<button class="btn-del-item text-red-500 hover:text-red-400 px-2" data-index="${index}">×</button>` : ''}
                                    <span class="text-[10px] opacity-50">▼</span>
                                </div>
                            </summary>
                            <div class="p-3 border-t border-white/5 space-y-3" id="item-${path}-${index}"></div>
                        `;
                        
                        listContainer.appendChild(itemDetails);
                        
                        if (!isTranslation) {
                            itemDetails.querySelector('.btn-del-item').addEventListener('click', (e) => {
                                e.preventDefault();
                                if(confirm('Delete this item?')) {
                                    actualVal.splice(index, 1);
                                    const rootContainer = document.getElementById('json-editor-container');
                                    if(rootContainer) renderAdminEditor(baseConfig, rootContainer);
                                }
                            });
                        }

                        const itemSchema = schemaVal[0] || item;
                        generateFormFields(itemSchema, itemDetails.querySelector(`#item-${path}-${index}`), `${path}.${index}`, targetConfig, isTranslation);
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
                            ensurePath(targetConfig, path);
                            setNestedValue(targetConfig, path, parsed);
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
        for (const key in schema) {
            const val = schema[key];
            const path = prefix ? `${prefix}.${key}` : key;
            const targetPath = `translations.${targetLang}.${path}`;
            const currentVal = getNestedValue(config, targetPath);

            if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                findMissing(val, path);
            } else if (!Array.isArray(val) && typeof val === 'string') {
                if (!currentVal) {
                    missing.push({ path: targetPath, source: val });
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
    
    try {
        for (const item of missing) {
            // Fetch translation
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(item.source)}`;
            
            const res = await fetch(url);
            if (!res.ok) throw new Error('API Error');
            
            const data = await res.json();
            // Structure is [[["Translated","Source",...]], ...]
            if (data && data[0] && data[0][0] && data[0][0][0]) {
                const translatedText = data[0][0][0];
                ensurePath(config, item.path);
                setNestedValue(config, item.path, translatedText);
                successCount++;
            }
            
            // Tiny delay to be polite to the free API
            await new Promise(r => setTimeout(r, 200));
        }
        
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