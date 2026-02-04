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
    const toggleBtn = document.getElementById('btn-toggle-github');
    const githubBox = document.getElementById('github-sync');
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
            generateForm(baseConfig, container);
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

    // GitHub token handling
    const savedToken = localStorage.getItem('axxa_github_token');
    if (tokenInput && savedToken) tokenInput.value = savedToken;
    updateGithubSavedState();

    const updateToggleLabel = () => {
        if (!toggleBtn || !githubBox) return;
        const collapsed = githubBox.classList.contains('github-collapsed');
        toggleBtn.textContent = collapsed ? t('admin.github.toggle_show', 'Expand') : t('admin.github.toggle', 'Collapse');
    };

    updateToggleLabel();

    toggleBtn?.addEventListener('click', () => {
        githubBox?.classList.toggle('github-collapsed');
        updateToggleLabel();
    });

    const collapseLater = () => {
        if (!githubBox) return;
        githubBox.classList.remove('github-collapsed');
        updateToggleLabel();
        setTimeout(() => {
            githubBox.classList.add('github-collapsed');
            updateToggleLabel();
        }, 2000);
    };

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
        const msg = t('admin.github.save_ok', 'Token saved.');
        setStatus(msg, 'ok');
        showToast(msg, 'success');
        collapseLater();
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
        collapseLater();

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
function generateForm(data, parent, prefix = '', targetConfig = baseConfig) {
    parent.innerHTML = '';
    
    // Helper for recursion
    const build = (obj, p, currentPrefix) => {
        for (const key in obj) {
            const val = obj[key];
            const path = currentPrefix ? `${currentPrefix}.${key}` : key;
            
            if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                // Label for Object
                const label = document.createElement('h4');
                label.className = 'text-primary font-bold mt-4 uppercase text-xs tracking-wider border-b border-white/10 pb-1 mb-2';
                label.innerText = key;
                p.appendChild(label);
                
                const group = document.createElement('div');
                group.className = 'pl-4 border-l-2 border-white/5 ml-1 space-y-3';
                p.appendChild(group);
                build(val, group, path);
            } else if (Array.isArray(val)) {
                // For now, Arrays just editable as raw JSON text area to keep it simple
                const wrapper = document.createElement('div');
                const label = document.createElement('label');
                label.className = 'block text-xs text-slate-500 mb-1 capitalize';
                label.innerText = key + ' (Array HTML/JSON)';
                
                const input = document.createElement('textarea');
                input.className = 'w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white font-mono h-24 focus:border-primary outline-none';
                input.value = JSON.stringify(val, null, 2);
                
                input.addEventListener('change', (e) => {
                    try {
                        const parsed = JSON.parse(e.target.value);
                        setNestedValue(targetConfig, path, parsed);
                        applyLanguage(currentLang);
                    } catch(err) {
                        alert('Invalid JSON for array');
                    }
                });

                wrapper.appendChild(label);
                wrapper.appendChild(input);
                p.appendChild(wrapper);

            } else {
                // Value Input
                const wrapper = document.createElement('div');
                const label = document.createElement('label');
                label.className = 'block text-xs text-slate-500 mb-1 capitalize';
                label.innerText = key;
                
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-primary outline-none';
                input.value = val;
                
                input.addEventListener('input', (e) => {
                    setNestedValue(targetConfig, path, e.target.value);
                    applyLanguage(currentLang);
                });

                wrapper.appendChild(label);
                wrapper.appendChild(input);
                p.appendChild(wrapper);
            }
        }
    };
    
    build(data, parent, prefix);
}

function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, i) => o[i], obj);
    target[last] = value;
}




function initContact() {
    const config = siteConfig.contact?.emailjs;
    // Check if config exists and has valid values (not placeholders)
    if (!config || !config.public_key || config.public_key.startsWith('YOUR')) {
        console.warn('EmailJS not fully configured.');
        return;
    }

    try {
        emailjs.init(config.public_key);
    } catch (e) {
        console.error('EmailJS init failed', e);
        return;
    }

    const form = document.getElementById('contact-form');
    if (form) {
        form.addEventListener('submit', function(event) {
            event.preventDefault();

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

            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            
            // Loading State
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('contact.form.sending', 'Sending...')}`;
            btn.disabled = true;
            btn.classList.add('opacity-70', 'cursor-not-allowed');

            // Construct secure params + dynamic data
            const params = {
                name: form.querySelector('[name="from_name"]').value,
                email: form.querySelector('[name="from_email"]').value,
                message: form.querySelector('[name="message"]').value,
                time: new Date().toLocaleString(getLocaleForLang(currentLang))
            };

            emailjs.send(config.service_id, config.template_id, params)
                .then(() => {
                    showToast(t('contact.form.send_success', 'Message sent successfully!'), 'success');
                    // Set Timestamp on Success
                    console.log(`[RateLimit] Setting timestamp: ${Date.now()}`);
                    localStorage.setItem('axxa_msg_ts', Date.now().toString());
                    form.reset();
                }, (error) => {
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
                const names = repos
                    .filter(r => r && r.permissions && (r.permissions.push || r.permissions.admin || r.permissions.maintain || r.permissions.triage || r.permissions.pull))
                    .map(r => r.full_name)
                    .filter(Boolean);

                // For classic tokens, GitHub returns x-oauth-scopes header.
                const scopes = reposRes.headers.get('x-oauth-scopes') || '';
                if (scopes.trim().length > 0) {
                    multiRepo = names.length > 1 && names.some(n => n.toLowerCase() !== repoInfo.repo.toLowerCase());
                } else {
                    // Fine-grained: only warn if other repos with effective permissions appear.
                    multiRepo = names.some(n => n.toLowerCase() !== repoInfo.repo.toLowerCase());
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
