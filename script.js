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
