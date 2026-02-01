/**
 * AXXA.DEV Main Script
 * Handles Dynamic Config Loading, Admin Interface, and Interactions
 */

let siteConfig = {};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load Config
    await loadConfig();

    // 2. Initialize UI Logic
    initSplash();
    initTheme();
    initNavigation();
    initAnimations();
    initProjectFilters();
    initModals();
    initAdmin();
    updateTime();
    setInterval(updateTime, 60000);

    // 3. Hide Preloader
    const preloader = document.getElementById('preloader');
    if (preloader) {
        preloader.style.opacity = '0';
        setTimeout(() => preloader.remove(), 500);
    }
});

// --- CORE: CONFIG LOADER ---
async function loadConfig() {
    try {
        const response = await fetch('config.json');
        siteConfig = await response.json();
        
        // Populate DOM
        populateText();
        populateLists();
        
        console.log('Config loaded successfully');
    } catch (error) {
        console.error('Failed to load config:', error);
        showToast('Error loading configuration', 'error');
    }
}

function populateText() {
    // 1. Text Content (data-i18n)
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const value = getNestedValue(siteConfig, key);
        if (value) {
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
        if (value) {
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
                    <div class="hidden md:block absolute left-[-60px] top-0 text-right w-40 pr-6 pt-1">
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
            container.innerHTML = siteConfig.writing.items.map(item => `
                 <a href="#" class="group block bg-white dark:bg-surface border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden hover:border-primary/50 transition-all reveal-on-scroll">
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
                             READ ARTICLE <i class="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                         </div>
                     </div>
                 </a>
            `).join('');
        }
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
                        <img src="${item.image}" alt="${item.author}" class="w-12 h-12 rounded-full border-2 border-primary/20">
                        <div>
                            <div class="font-bold text-slate-900 dark:text-white">${item.author}</div>
                            <div class="text-xs text-primary font-bold uppercase">${item.role}</div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }
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
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal-on-scroll').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';
        observer.observe(el);
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
    });

    // Login Logic
    loginBtn.addEventListener('click', () => {
        // Simple hardcoded check for demonstration "secret menu"
        // In a real app, this would be server-side or at least hashed.
        if (passInput.value === 'admin123') { // Secret Password
            loginForm.classList.add('hidden');
            editor.classList.remove('hidden');
            generateForm(siteConfig, container);
        } else {
            errorMsg.classList.remove('hidden');
            passInput.classList.add('border-red-500');
        }
    });

    // Save Logic
    saveBtn.addEventListener('click', () => {
        const text = JSON.stringify(siteConfig, null, 4);
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
}

// Recursive function to generate inputs for JSON
function generateForm(data, parent, prefix = '') {
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
                        setNestedValue(siteConfig, path, parsed);
                        // Optional: Live update DOM
                        populateText(); 
                        populateLists();
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
                    setNestedValue(siteConfig, path, e.target.value);
                    populateText(); // Live preview for text!
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


// --- UTILS ---
function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    document.querySelectorAll('#local-time').forEach(el => el.textContent = timeString);
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
