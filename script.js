document.addEventListener('DOMContentLoaded', () => {
    
    /* =========================================
       SPLASH SCREEN LOGIC
       ========================================= */
    const splash = document.getElementById('splash-screen');
    
    const enterSystem = () => {
        if (!splash || splash.classList.contains('fade-out')) return;
        
        splash.classList.add('fade-out');
        
        // Remove from DOM/Display after animation to enable interaction with main site
        setTimeout(() => {
            splash.style.display = 'none';
        }, 1500); 
    };

    if (splash) {
        // Auto fade after 3 seconds
        setTimeout(enterSystem, 3000);
        
        // Interaction triggers
        splash.addEventListener('click', enterSystem);
        document.addEventListener('keydown', (e) => {
             if (e.key === 'Enter') enterSystem();
        });
    }

    /* =========================================
       PORTFOLIO ORIGINAL LOGIC
       ========================================= */

    // Custom Cursor
    const cursor = document.createElement('div');
    cursor.classList.add('custom-cursor');
    document.body.appendChild(cursor);

    document.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
        
        // Spotlight effect calculation
        document.querySelectorAll('.spotlight-card').forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    document.querySelectorAll('a, button, .hoverable').forEach(el => {
        el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
        el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
    });

    // Magnetic Buttons
    document.querySelectorAll('.magnetic-btn').forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate(0, 0)';
        });
    });

    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;
    const icon = themeToggle.querySelector('i');

    // Check saved theme
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        html.classList.add('dark');
        icon.classList.replace('fa-moon', 'fa-sun');
    } else {
        html.classList.remove('dark');
        icon.classList.replace('fa-sun', 'fa-moon');
    }

    themeToggle.addEventListener('click', () => {
        html.classList.toggle('dark');
        if (html.classList.contains('dark')) {
            localStorage.theme = 'dark';
            icon.classList.replace('fa-moon', 'fa-sun');
        } else {
            localStorage.theme = 'light';
            icon.classList.replace('fa-sun', 'fa-moon');
        }
    });

    // Mobile Menu
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closeMenuBtn = document.getElementById('close-menu');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileLinks = document.querySelectorAll('.mobile-link');

    function toggleMenu() {
        const isOpen = mobileMenu.style.pointerEvents === 'auto';
        mobileMenu.style.opacity = isOpen ? '0' : '1';
        mobileMenu.style.pointerEvents = isOpen ? 'none' : 'auto';
        document.body.style.overflow = isOpen ? 'auto' : 'hidden'; // Prevent scrolling
    }

    mobileMenuBtn.addEventListener('click', toggleMenu);
    closeMenuBtn.addEventListener('click', toggleMenu);

    mobileLinks.forEach(link => {
        link.addEventListener('click', toggleMenu);
    });

    // Preloader (Website Load)
    const preloader = document.getElementById('preloader');
    if (preloader) {
        window.addEventListener('load', () => {
            preloader.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => {
                preloader.style.display = 'none';
            }, 500);
        });
    }

    // Scroll Reveal Animation (Intersection Observer)
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target); // Animate only once
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal-on-scroll').forEach(el => {
        observer.observe(el);
    });

    // Navigation Active State (Scroll Spy)
    const sections = document.querySelectorAll('.section-spy');
    const navLinks = document.querySelectorAll('.nav-link');

    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (scrollY >= (sectionTop - 200)) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('text-primary', 'dark:text-white'); // Remove active styles
            link.classList.add('text-slate-600', 'dark:text-slate-400'); // Default styles
            if (link.getAttribute('href').includes(current)) {
                link.classList.remove('text-slate-600', 'dark:text-slate-400');
                link.classList.add('text-primary', 'dark:text-white'); // Add active styles
            }
        });
    });

    // Project Filtering
    const filterBtns = document.querySelectorAll('.filter-btn');
    const projectItems = document.querySelectorAll('.project-item');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            filterBtns.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');

            const filterValue = btn.getAttribute('data-filter');

            projectItems.forEach(item => {
                const categories = item.getAttribute('data-filter-category').split(' ');
                if (filterValue === 'all' || categories.includes(filterValue)) {
                    item.style.display = 'block';
                    setTimeout(() => {
                        item.classList.add('visible'); // Re-trigger fade in
                        item.style.opacity = '1';
                        item.style.transform = 'translateY(0)';
                    }, 50);
                } else {
                    item.style.opacity = '0';
                    item.style.transform = 'translateY(20px)';
                    setTimeout(() => {
                        item.style.display = 'none';
                    }, 300);
                }
            });
        });
    });

    // Time Widget
    function updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const timeElement = document.getElementById('local-time');
        if (timeElement) timeElement.textContent = timeString;
    }
    setInterval(updateTime, 1000);
    updateTime();

    // Scroll To Top Button
    const scrollToTopBtn = document.getElementById('scrollToTopBtn');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 500) {
            scrollToTopBtn.classList.remove('opacity-0', 'translate-y-20');
        } else {
            scrollToTopBtn.classList.add('opacity-0', 'translate-y-20');
        }
    });

    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // Project Detail Modal
    const modal = document.getElementById('project-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalContent = document.getElementById('modal-content');
    const projectTriggers = document.querySelectorAll('.project-trigger');

    // Modal Elements
    const modalTitle = document.getElementById('modal-title');
    const modalCategory = document.getElementById('modal-category');
    const modalImage = document.getElementById('modal-image');
    const modalDesc = document.getElementById('modal-desc');

    function openModal(projectData) {
        modalTitle.textContent = projectData.title;
        modalCategory.textContent = projectData.category;
        modalImage.src = projectData.image;
        modalDesc.textContent = projectData.desc;

        modal.classList.remove('hidden');
        // Small delay to allow display:block to apply before transition
        setTimeout(() => {
            modalBackdrop.classList.remove('opacity-0');
            modalContent.classList.remove('opacity-0', 'scale-95');
        }, 10);
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modalBackdrop.classList.add('opacity-0');
        modalContent.classList.add('opacity-0', 'scale-95');
        
        setTimeout(() => {
            modal.classList.add('hidden');
            document.body.style.overflow = 'auto'; 
        }, 300);
    }

    projectTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            // Don't open if clicking a button inside (like the 'plus' button if it has its own logic)
            // But here the whole card is clickable.
            const data = {
                title: trigger.getAttribute('data-title'),
                category: trigger.getAttribute('data-category'),
                image: trigger.getAttribute('data-image'),
                desc: trigger.getAttribute('data-desc')
            };
            openModal(data);
        });
    });

    closeModalBtn.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeModal();
        }
    });

    // Contact Form Handling (Simple Alert)
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Show toast/notification
            const toast = document.createElement('div');
            toast.className = 'px-6 py-3 bg-white dark:bg-surface border-l-4 border-primary shadow-xl rounded-r-lg flex items-center gap-3 transform transition-all duration-300 translate-y-10 opacity-0';
            toast.innerHTML = `
                <i class="fas fa-check-circle text-primary text-xl"></i>
                <div>
                    <h4 class="font-bold text-slate-900 dark:text-white text-sm">Pesan Terkirim!</h4>
                    <p class="text-xs text-slate-500">Terima kasih telah menghubungi saya.</p>
                </div>
            `;
            
            const container = document.getElementById('toast-container');
            container.appendChild(toast);

            // Animate in
            setTimeout(() => {
                toast.classList.remove('translate-y-10', 'opacity-0');
            }, 10);

            // Animate out
            setTimeout(() => {
                toast.classList.add('translate-y-10', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);

            contactForm.reset();
        });
    }

});
