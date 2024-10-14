import { event_types, eventSource } from '../../../../script.js';
import { extensionNames } from '../../../extensions.js';
import { Popup } from '../../../popup.js';
import { renderTemplateAsync } from '../../../templates.js';
import { debounce, delay } from '../../../utils.js';
import { createNewWorldInfo, createWorldInfoEntry, getFreeWorldName, getWorldEntry, loadWorldInfo, onWorldInfoChange, saveWorldInfo, selected_world_info, world_info, world_names } from '../../../world-info.js';

const dom = {
    /**@type {HTMLElement} */
    books: undefined,
    /**@type {HTMLElement} */
    editor: undefined,
    /**@type {HTMLElement} */
    activationToggle: undefined,
};
/**@type {{name:string, uid:string}} */
let currentEditor;

const activationBlock = document.querySelector('#wiActivationSettings');
const activationBlockParent = activationBlock.parentElement;

const entryState = function (entry) {
    if (entry.constant === true) {
        return 'constant';
    } else if (entry.vectorized === true) {
        return 'vectorized';
    } else {
        return 'normal';
    }
};

const cache = {};
const updateSettingsChange = ()=>{
    console.log('[STWID]', '[UPDATE-SETTINGS]');
    for (const [name, world] of Object.entries(cache)) {
        const active = selected_world_info.includes(name);
        if (world.dom.active.checked != active) {
            world.dom.active.checked = active;
        }
    }
};
let updateWIChangeStarted = Promise.withResolvers();
/**@type {PromiseWithResolvers<any>} */
let updateWIChangeFinished;
const updateWIChange = async(name = null, data = null)=>{
    console.log('[STWID]', '[UPDATE-WI]', name, data);
    updateWIChangeFinished = Promise.withResolvers();
    updateWIChangeStarted.resolve();
    // removed books
    for (const [n, w] of Object.entries(cache)) {
        if (world_names.includes(n)) continue;
        else {
            w.dom.root.remove();
            delete cache[n];
        }
    }
    // added books
    for (const name of world_names) {
        if (cache[name]) continue;
        else {
            const before = Object.keys(cache).find(it=>it.toLowerCase().localeCompare(name.toLowerCase()) == 1);
            cache[name] = { entries:{} };
            const data = await loadWorldInfo(name);
            for (const [k,v] of Object.entries(data.entries)) {
                cache[name].entries[k] = structuredClone(v);
            }
            renderBook(name, before ? cache[before].dom.root : null);
        }
    }
    if (name && cache[name]) {
        const world = { entries:{} };
        for (const [k,v] of Object.entries(data.entries)) {
            world.entries[k] = structuredClone(v);
        }
        // removed entries
        for (const e of Object.keys(cache[name].entries)) {
            if (world.entries[e]) continue;
            cache[name].dom.entry[e].root.remove();
            delete cache[name].dom.entry[e];
            delete cache[name].entries[e];
            if (currentEditor?.name == name && currentEditor?.uid == e) {
                currentEditor = null;
                dom.editor.innerHTML = '';
            }
        }
        // added entries
        for (const e of Object.keys(world.entries)) {
            if (cache[name].entries[e]) continue;
            const sorted = Object.values(cache[name].entries).toSorted((a,b)=>(a.comment || a.key.join(', ')).toLowerCase().localeCompare((b.comment || b.key.join(', ')).toLowerCase()));
            let a = world.entries[e];
            const before = sorted.find(it=>(it.comment || it.key.join(', ')).toLowerCase().localeCompare((a.comment || a.key.join(', ')).toLowerCase()));
            await renderEntry(a, name, before ? cache[name].dom.entry[before.uid].root : null);
        }
        // updated entries
        let hasUpdate = false;
        for (const [e,o] of Object.entries(cache[name].entries)) {
            const n = world.entries[e];
            let hasChange = false;
            for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
                if (o[k] == n[k]) continue;
                if (typeof o[k] == 'object' && JSON.stringify(o[k]) == JSON.stringify(n[k])) continue;
                hasChange = true;
                hasUpdate = true;
                switch (k) {
                    case 'comment': {
                        cache[name].dom.entry[e].comment.textContent = n.comment;
                        break;
                    }
                    case 'key': {
                        cache[name].dom.entry[e].key.textContent = n.key.join(', ');
                        break;
                    }
                    case 'disable': {
                        cache[name].dom.entry[e].isEnabled.classList[n[k] ? 'remove' : 'add']('fa-toggle-on');
                        cache[name].dom.entry[e].isEnabled.classList[n[k] ? 'add' : 'remove']('fa-toggle-off');
                        break;
                    }
                    case 'constant':
                    case 'vectorized': {
                        cache[name].dom.entry[e].strategy.value = entryState(n);
                        break;
                    }
                }
            }
            if (hasChange && currentEditor?.name == name && currentEditor?.uid == e) {
                // cache[name].dom.entry[e].root.click();
            }
        }
        cache[name].entries = world.entries;
        if (hasUpdate) {
            const sorted = Object.values(cache[name].entries).toSorted((a,b)=>(a.comment || a.key.join(', ')).toLowerCase().localeCompare((b.comment || b.key.join(', ')).toLowerCase()));
            let needsSort = false;
            let i = 0;
            for (const e of sorted) {
                if (cache[name].dom.entryList.children[i] != cache[name].dom.entry[e.uid].root) {
                    needsSort = true;
                    break;
                }
                i++;
            }
            if (needsSort) {
                for (const e of sorted) {
                    cache[name].dom.entryList.append(cache[name].dom.entry[e.uid].root);
                }
            }
        }
    }
    updateWIChangeStarted = Promise.withResolvers();
    updateWIChangeFinished.resolve();
};
const updateWIChangeDebounced = debounce(updateWIChange);

eventSource.on(event_types.WORLDINFO_UPDATED, (name, world)=>updateWIChangeDebounced(name, world));
eventSource.on(event_types.WORLDINFO_SETTINGS_UPDATED, ()=>updateSettingsChange());


export const jumpToEntry = async(name, uid)=>{
    if (dom.activationToggle.classList.contains('stwid--active')) {
        dom.activationToggle.click();
    }
    cache[name].dom.entryList.classList.remove('stwid--isCollapsed');
    cache[name].dom.collapseToggle.classList.add('fa-chevron-up');
    cache[name].dom.collapseToggle.classList.remove('fa-chevron-down');
    cache[name].dom.entry[uid].root.scrollIntoView({ block:'center', inline:'center' });
    if (currentEditor?.name != name || currentEditor?.uid != uid) {
        cache[name].dom.entry[uid].root.click();
    }
};


const renderBook = async(name, before = null)=>{
    const data = await loadWorldInfo(name);
    const world = { entries:{} };
    for (const [k,v] of Object.entries(data.entries)) {
        world.entries[k] = structuredClone(v);
    }
    world.dom = {
        /**@type {HTMLElement} */
        root: undefined,
        /**@type {HTMLElement} */
        name: undefined,
        /**@type {HTMLElement} */
        active: undefined,
        /**@type {HTMLElement} */
        entryList: undefined,
        /**@type {{ [uid:string]:{root:HTMLElement, comment:HTMLElement, key:HTMLElement}}} */
        entry: {},
    };
    cache[name] = world;
    const book = document.createElement('div'); {
        world.dom.root = book;
        book.classList.add('stwid--book');
        const head = document.createElement('div'); {
            head.classList.add('stwid--head');
            let collapseToggle;
            const title = document.createElement('div'); {
                world.dom.name = title;
                title.classList.add('stwid--title');
                title.textContent = name;
                title.addEventListener('click', ()=>{
                    const is = entryList.classList.toggle('stwid--isCollapsed');
                    if (is) {
                        collapseToggle.classList.remove('fa-chevron-up');
                        collapseToggle.classList.add('fa-chevron-down');
                    } else {
                        collapseToggle.classList.add('fa-chevron-up');
                        collapseToggle.classList.remove('fa-chevron-down');
                    }
                });
                head.append(title);
            }
            const actions = document.createElement('div'); {
                actions.classList.add('stwid--actions');
                const active = document.createElement('input'); {
                    world.dom.active = active;
                    active.title = 'Globally active';
                    active.type = 'checkbox';
                    active.checked = selected_world_info.includes(name);
                    active.addEventListener('click', async()=>{
                        active.disabled = true;
                        onWorldInfoChange({ silent:'true', state:(active.checked ? 'on' : 'off') }, name);
                        active.disabled = false;
                    });
                    actions.append(active);
                }
                const add = document.createElement('div'); {
                    add.classList.add('stwid--action');
                    add.classList.add('stwid--add');
                    add.classList.add('fa-solid', 'fa-fw', 'fa-plus');
                    add.title = 'New Entry';
                    add.addEventListener('click', async()=>{
                        const data = { entries:structuredClone(cache[name].entries) };
                        const newEntry = createWorldInfoEntry(name, data);
                        cache[name].entries[newEntry.uid] = structuredClone(newEntry);
                        await renderEntry(newEntry, name);
                        cache[name].dom.entry[newEntry.uid].root.click();
                        await saveWorldInfo(name, data, true);
                    });
                    actions.append(add);
                }
                const menuTrigger = document.createElement('div'); {
                    menuTrigger.classList.add('stwid--action');
                    menuTrigger.classList.add('stwid--menuTrigger');
                    menuTrigger.classList.add('fa-solid', 'fa-fw', 'fa-ellipsis-vertical');
                    menuTrigger.addEventListener('click', ()=>{
                        menuTrigger.style.anchorName = '--stwid--ctxAnchor';
                        const blocker = document.createElement('div'); {
                            blocker.classList.add('stwid--blocker');
                            blocker.addEventListener('click', ()=>{
                                blocker.remove();
                                menuTrigger.style.anchorName = '';
                            });
                            const menu = document.createElement('div'); {
                                menu.classList.add('stwid--menu');
                                const rename = document.createElement('div'); {
                                    rename.classList.add('stwid--item');
                                    rename.classList.add('stwid--rename');
                                    rename.addEventListener('click', async(evt)=>{
                                        evt.stopPropagation();
                                        toastr.warning('not implemented');
                                    });
                                    const i = document.createElement('i'); {
                                        i.classList.add('stwid--icon');
                                        i.classList.add('fa-solid', 'fa-fw', 'fa-pencil');
                                        rename.append(i);
                                    }
                                    const txt = document.createElement('span'); {
                                        txt.classList.add('stwid--label');
                                        txt.textContent = 'Rename Book';
                                        rename.append(txt);
                                    }
                                    menu.append(rename);
                                }
                                if (extensionNames.includes('third-party/SillyTavern-WorldInfoBulkEdit')) {
                                    const bulk = document.createElement('div'); {
                                        bulk.classList.add('stwid--item');
                                        bulk.classList.add('stwid--bulkEdit');
                                        bulk.addEventListener('click', async(evt)=>{
                                            const sel = /**@type {HTMLSelectElement}*/(document.querySelector('#world_editor_select'));
                                            sel.value = /**@type {HTMLOptionElement[]}*/([...sel.children]).find(it=>it.textContent == name).value;
                                            sel.dispatchEvent(new Event('change', { bubbles:true }));
                                            await delay(500);
                                            document.querySelector('.stwibe--trigger').click();
                                        });
                                        const i = document.createElement('i'); {
                                            i.classList.add('stwid--icon');
                                            i.classList.add('fa-solid', 'fa-fw', 'fa-list-check');
                                            bulk.append(i);
                                        }
                                        const txt = document.createElement('span'); {
                                            txt.classList.add('stwid--label');
                                            txt.textContent = 'Bulk Edit';
                                            bulk.append(txt);
                                        }
                                        menu.append(bulk);
                                    }
                                }
                                const exp = document.createElement('div'); {
                                    exp.classList.add('stwid--item');
                                    exp.classList.add('stwid--export');
                                    exp.addEventListener('click', async(evt)=>{
                                        evt.stopPropagation();
                                        toastr.warning('not implemented');
                                    });
                                    const i = document.createElement('i'); {
                                        i.classList.add('stwid--icon');
                                        i.classList.add('fa-solid', 'fa-fw', 'fa-file-export');
                                        exp.append(i);
                                    }
                                    const txt = document.createElement('span'); {
                                        txt.classList.add('stwid--label');
                                        txt.textContent = 'Export Book';
                                        exp.append(txt);
                                    }
                                    menu.append(exp);
                                }
                                const dup = document.createElement('div'); {
                                    dup.classList.add('stwid--item');
                                    dup.classList.add('stwid--duplicate');
                                    dup.addEventListener('click', async(evt)=>{
                                        evt.stopPropagation();
                                        toastr.warning('not implemented');
                                    });
                                    const i = document.createElement('i'); {
                                        i.classList.add('stwid--icon');
                                        i.classList.add('fa-solid', 'fa-fw', 'fa-paste');
                                        dup.append(i);
                                    }
                                    const txt = document.createElement('span'); {
                                        txt.classList.add('stwid--label');
                                        txt.textContent = 'Duplicate Book';
                                        dup.append(txt);
                                    }
                                    menu.append(dup);
                                }
                                const del = document.createElement('div'); {
                                    del.classList.add('stwid--item');
                                    del.classList.add('stwid--delete');
                                    del.addEventListener('click', async(evt)=>{
                                        evt.stopPropagation();
                                        toastr.warning('not implemented');
                                    });
                                    const i = document.createElement('i'); {
                                        i.classList.add('stwid--icon');
                                        i.classList.add('fa-solid', 'fa-fw', 'fa-trash-can');
                                        del.append(i);
                                    }
                                    const txt = document.createElement('span'); {
                                        txt.classList.add('stwid--label');
                                        txt.textContent = 'Delete Book';
                                        del.append(txt);
                                    }
                                    menu.append(del);
                                }
                                blocker.append(menu);
                            }
                            document.body.append(blocker);
                        }
                    });
                    actions.append(menuTrigger);
                }
                collapseToggle = document.createElement('div'); {
                    cache[name].dom.collapseToggle = collapseToggle;
                    collapseToggle.classList.add('stwid--action');
                    collapseToggle.classList.add('stwid--collapseToggle');
                    collapseToggle.classList.add('fa-solid', 'fa-fw', 'fa-chevron-down');
                    collapseToggle.addEventListener('click', ()=>{
                        const is = entryList.classList.toggle('stwid--isCollapsed');
                        if (is) {
                            collapseToggle.classList.remove('fa-chevron-up');
                            collapseToggle.classList.add('fa-chevron-down');
                        } else {
                            collapseToggle.classList.add('fa-chevron-up');
                            collapseToggle.classList.remove('fa-chevron-down');
                        }
                    });
                    actions.append(collapseToggle);
                }
                head.append(actions);
            }
            book.append(head);
        }
        const entryList = document.createElement('div'); {
            world.dom.entryList = entryList;
            entryList.classList.add('stwid--entryList');
            entryList.classList.add('stwid--isCollapsed');
            for (const e of Object.values(world.entries).toSorted((a,b)=>(a.comment || a.key.join(', ')).toLowerCase().localeCompare((b.comment || b.key.join(', ')).toLowerCase()))) {
                await renderEntry(e, name);
            }
            book.append(entryList);
        }
        if (before) before.insertAdjacentElement('beforebegin', book);
        else dom.books.append(book);
    }
    return book;
};
const renderEntry = async(e, name, before = null)=>{
    const world = cache[name];
    world.dom.entry[e.uid] = {};
    const entry = document.createElement('div'); {
        world.dom.entry[e.uid].root = entry;
        entry.classList.add('stwid--entry');
        const body = document.createElement('div'); {
            body.classList.add('stwid--body');
            const comment = document.createElement('div'); {
                world.dom.entry[e.uid].comment = comment;
                comment.classList.add('stwid--comment');
                comment.textContent = e.comment;
                body.append(comment);
            }
            const key = document.createElement('div'); {
                world.dom.entry[e.uid].key = key;
                key.classList.add('stwid--key');
                key.textContent = e.key.join(', ');
                body.append(key);
            }
            entry.append(body);
        }
        const status = document.createElement('div'); {
            status.classList.add('stwid--status');
            status.addEventListener('click', (evt)=>{
                if (currentEditor?.name != name || currentEditor?.uid != e.uid) evt.stopPropagation();
            });
            const isEnabled = /**@type {HTMLSelectElement}*/(document.querySelector('#entry_edit_template [name="entryKillSwitch"]').cloneNode(true)); {
                world.dom.entry[e.uid].isEnabled = isEnabled;
                isEnabled.classList.add('stwid--enabled');
                if (e.disable) {
                    isEnabled.classList.toggle('fa-toggle-off');
                    isEnabled.classList.toggle('fa-toggle-on');
                }
                isEnabled.addEventListener('click', async()=>{
                    const dis = isEnabled.classList.toggle('fa-toggle-off');
                    isEnabled.classList.toggle('fa-toggle-on');
                    cache[name].entries[e.uid].disable = dis;
                    await saveWorldInfo(name, { entries:cache[name].entries }, true);
                });
                status.append(isEnabled);
            }
            const strat = /**@type {HTMLSelectElement}*/(document.querySelector('#entry_edit_template [name="entryStateSelector"]').cloneNode(true)); {
                world.dom.entry[e.uid].strategy = strat;
                strat.classList.add('stwid--strategy');
                strat.value = entryState(e);
                strat.addEventListener('change', async()=>{
                    const value = strat.value;
                    switch (value) {
                        case 'constant': {
                            cache[name].entries[e.uid].constant = true;
                            cache[name].entries[e.uid].vectorized = false;
                            break;
                        }
                        case 'normal': {
                            cache[name].entries[e.uid].constant = false;
                            cache[name].entries[e.uid].vectorized = false;
                            break;
                        }
                        case 'vectorized': {
                            cache[name].entries[e.uid].constant = false;
                            cache[name].entries[e.uid].vectorized = true;
                            break;
                        }
                    }
                    await saveWorldInfo(name, { entries:cache[name].entries }, true);
                });
                status.append(strat);
            }
            entry.append(status);
        }
        const actions = document.createElement('div'); {
            actions.classList.add('stwid--actions');
            entry.append(actions);
        }
        entry.addEventListener('click', async()=>{
            for (const cb of Object.values(cache)) {
                for (const ce of Object.values(cb.dom.entry)) {
                    ce.root.classList.remove('stwid--active');
                }
            }
            if (dom.activationToggle.classList.contains('stwid--active')) {
                dom.activationToggle.click();
            }
            entry.classList.add('stwid--active');
            dom.editor.innerHTML = '';
            const unfocus = document.createElement('div'); {
                unfocus.classList.add('stwid--unfocusToggle');
                unfocus.classList.add('menu_button');
                unfocus.classList.add('fa-solid', 'fa-fw', 'fa-compress');
                unfocus.title = 'Unfocus';
                unfocus.addEventListener('click', ()=>{
                    dom.editor.classList.toggle('stwid--focus');
                });
                dom.editor.append(unfocus);
            }
            dom.editor.append(document.createRange().createContextualFragment(await renderTemplateAsync('worldInfoKeywordHeaders')).querySelector('#WIEntryHeaderTitlesPC'));
            const editDom = (await getWorldEntry(name, { entries:cache[name].entries }, cache[name].entries[e.uid]))[0];
            const focusContainer = editDom.querySelector('label[for="content "] > small > span > span'); {
                const btn = document.createElement('div'); {
                    btn.classList.add('stwid--focusToggle');
                    btn.classList.add('menu_button');
                    btn.classList.add('fa-solid', 'fa-fw', 'fa-expand');
                    btn.title = 'Focus';
                    btn.addEventListener('click', ()=>{
                        dom.editor.classList.toggle('stwid--focus');
                    });
                    focusContainer.append(btn);
                }
            }
            dom.editor.append(editDom);
            currentEditor = { name, uid:e.uid };
        });
        if (before) before.insertAdjacentElement('beforebegin', entry);
        else world.dom.entryList.append(entry);
        return entry;
    }
};
const loadList = async()=>{
    dom.books.innerHTML = '';
    for (const name of world_names.toSorted((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()))) {
        await renderBook(name);
    }
};
const loadListDebounced = debounce(()=>loadList());


const addDrawer = ()=>{
    document.body.classList.add('stwid--');
    const holder = document.querySelector('#wi-holder');
    const drawerContent = document.querySelector('#WorldInfo'); {
        let searchEntriesInput;
        const body = document.createElement('div'); {
            body.classList.add('stwid--body');
            const list = document.createElement('div'); {
                list.classList.add('stwid--list');
                const controls = document.createElement('div'); {
                    controls.classList.add('stwid--controls');
                    const add = /**@type {HTMLElement}*/(document.querySelector('#world_create_button').cloneNode(true)); {
                        add.removeAttribute('id');
                        add.classList.add('stwid--addBook');
                        add.addEventListener('click', async()=>{
                            const startPromise = updateWIChangeStarted.promise;
                            const tempName = getFreeWorldName();
                            const finalName = await Popup.show.input('Create a new World Info', 'Enter a name for the new file:', tempName);
                            if (finalName) {
                                const created = await createNewWorldInfo(finalName, { interactive: true });
                                if (created) {
                                    await startPromise;
                                    await updateWIChangeFinished.promise;
                                    cache[finalName].dom.entryList.classList.remove('stwid--isCollapsed');
                                    cache[name].dom.collapseToggle.classList.add('fa-chevron-up');
                                    cache[name].dom.collapseToggle.classList.remove('fa-chevron-down');
                                    cache[finalName].dom.root.scrollIntoView({ block:'center', inline:'center' });
                                }
                            }
                        });
                        controls.append(add);
                    }
                    const imp = document.createElement('div'); {
                        imp.classList.add('menu_button');
                        imp.classList.add('fa-solid', 'fa-fw', 'fa-file-import');
                        imp.title = 'Import Book';
                        imp.addEventListener('click', ()=>{
                            /**@type {HTMLInputElement}*/(document.querySelector('#world_import_file')).click();
                        });
                        controls.append(imp);
                    }
                    const settings = document.createElement('div'); {
                        dom.activationToggle = settings;
                        settings.classList.add('stwid--activation');
                        settings.classList.add('menu_button');
                        settings.classList.add('fa-solid', 'fa-fw', 'fa-cog');
                        settings.title = 'Global Activation Settings';
                        settings.addEventListener('click', ()=>{
                            const is = settings.classList.toggle('stwid--active');
                            currentEditor = null;
                            if (is) {
                                dom.editor.innerHTML = '';
                                for (const cb of Object.values(cache)) {
                                    for (const ce of Object.values(cb.dom.entry)) {
                                        ce.root.classList.remove('stwid--active');
                                    }
                                }
                                const h4 = document.createElement('h4'); {
                                    h4.textContent = 'Global World Info/Lorebook activation settings';
                                    dom.editor.append(h4);
                                }
                                dom.editor.append(activationBlock);
                            } else {
                                activationBlockParent.append(activationBlock);
                                dom.editor.innerHTML = '';
                            }
                        });
                        controls.append(settings);
                    }
                    list.append(controls);
                }
                const filter = document.createElement('div'); {
                    filter.classList.add('stwid--filter');
                    const search = document.createElement('input'); {
                        search.classList.add('stwid--search');
                        search.classList.add('text_pole');
                        search.type = 'search';
                        search.placeholder = 'Search books';
                        search.addEventListener('input', ()=>{
                            const query = search.value.toLowerCase();
                            for (const b of Object.keys(cache)) {
                                if (query.length) {
                                    const bookMatch = b.toLowerCase().includes(query);
                                    const entryMatch = searchEntriesInput.checked && Object.values(cache[b].entries).find(e=>e.comment.toLowerCase().includes(query));
                                    if (bookMatch || entryMatch) {
                                        cache[b].dom.root.classList.remove('stwid--filter-query');
                                        if (searchEntriesInput.checked) {
                                            for (const e of Object.values(cache[b].entries)) {
                                                if (bookMatch || e.comment.toLowerCase().includes(query)) {
                                                    cache[b].dom.entry[e.uid].root.classList.remove('stwid--filter-query');
                                                } else {
                                                    cache[b].dom.entry[e.uid].root.classList.add('stwid--filter-query');
                                                }
                                            }
                                        }
                                    } else {
                                        cache[b].dom.root.classList.add('stwid--filter-query');
                                    }
                                } else {
                                    cache[b].dom.root.classList.remove('stwid--filter-query');
                                    for (const e of Object.values(cache[b].entries)) {
                                        cache[b].dom.entry[e.uid].root.classList.remove('stwid--filter-query');
                                    }
                                }
                            }
                        });
                        filter.append(search);
                    }
                    const searchEntries = document.createElement('label'); {
                        searchEntries.classList.add('stwid--searchEntries');
                        searchEntries.title = 'Search through entries as well (Title/Memo)';
                        const inp = document.createElement('input'); {
                            searchEntriesInput = inp;
                            inp.type = 'checkbox';
                            inp.addEventListener('click', ()=>{
                                search.dispatchEvent(new Event('input'));
                            });
                            searchEntries.append(inp);
                        }
                        searchEntries.append('Entries');
                        filter.append(searchEntries);
                    }
                    const filterActive = document.createElement('label'); {
                        filterActive.classList.add('stwid--filterActive');
                        filterActive.title = 'Only show globally active books';
                        const inp = document.createElement('input'); {
                            inp.type = 'checkbox';
                            inp.addEventListener('click', ()=>{
                                for (const b of Object.keys(cache)) {
                                    if (inp.checked) {
                                        if (selected_world_info.includes(b)) {
                                            cache[b].dom.root.classList.remove('stwid--filter-active');
                                        } else {
                                            cache[b].dom.root.classList.add('stwid--filter-active');
                                        }
                                    } else {
                                        cache[b].dom.root.classList.remove('stwid--filter-active');
                                    }
                                }
                            });
                            filterActive.append(inp);
                        }
                        filterActive.append('Active');
                        filter.append(filterActive);
                    }
                    list.append(filter);
                }
                const books = document.createElement('div'); {
                    dom.books = books;
                    books.classList.add('stwid--books');
                    list.append(books);
                }
                body.append(list);
            }
            const editor = document.createElement('div'); {
                dom.editor = editor;
                editor.classList.add('stwid--editor');
                body.append(editor);
            }
            drawerContent.append(body);
        }
    }
    drawerContent.querySelector('h3 > span').addEventListener('click', ()=>{
        const is = document.body.classList.toggle('stwid--');
        if (!is) {
            if (dom.activationToggle.classList.contains('stwid--active')) {
                dom.activationToggle.click();
            }
        }
    });
    const moSel = new MutationObserver(()=>updateWIChangeDebounced());
    moSel.observe(document.querySelector('#world_editor_select'), { childList: true });
    const moDrawer = new MutationObserver(muts=>{
        if (drawerContent.getAttribute('style').includes('display: none;')) return;
        if (currentEditor) {
            cache[currentEditor.name].dom.entry[currentEditor.uid].root.click();
        }
    });
    moDrawer.observe(drawerContent, { attributes:true, attributeFilter:['style'] });
};
addDrawer();
loadListDebounced();


let isDiscord;
const checkDiscord = async()=>{
    let newIsDiscord = window.getComputedStyle(document.body).getPropertyValue('--nav-bar-width') !== '';
    if (isDiscord != newIsDiscord) {
        isDiscord = newIsDiscord;
        document.body.classList[isDiscord ? 'remove' : 'add']('stwid--nonDiscord');
    }
    setTimeout(()=>checkDiscord(), 1000);
};
checkDiscord();
