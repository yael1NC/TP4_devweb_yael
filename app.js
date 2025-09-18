"use strict";

const $ = (s) => document.querySelector(s);
let isRunning = false;

function updateProgress(curr, total, txt = "") {
    const fill = $("#progress-fill");
    const counter = $("#progress-counter");
    const pct = total > 0 ? (curr / total) * 100 : 0;
    fill.style.width = pct + "%";
    counter.textContent = `${curr} / ${total}${txt ? " — " + txt : ""}`;
}

function toApiUrl(url = "") {
    const path = String(url).trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "");
    const [owner, repo] = path.split("/");
    return {
        api: owner && repo ? `https://api.github.com/repos/${owner}/${repo}` : "",
        html: owner && repo ? `https://github.com/${owner}/${repo}` : url,
        full: `${owner}/${repo}`
    };
}

function authHeaders() {
    const token = $("#gh-token").value.trim();
    return token ? {Authorization: `token ${token}`} : {};
}

function updateRate(headers) {
    const limit = headers.get("x-ratelimit-limit");
    const remaining = headers.get("x-ratelimit-remaining");
    if (limit && remaining) {
        $("#rate-info").textContent = `rate ${remaining}/${limit}`;
    }
}

async function checkLinkAlive(link) {
    const href = link?.url || link?.html_url || "";
    const initStars = link?.stars || link?.stargazers_count || null;
    const {api, html, full} = toApiUrl(href);
    const meta = {full, html, status: null, ok: false, initial: initStars, current: null, delta: null};

    if (!api) {
        meta.status = "invalid";
        return meta;
    }

    try {
        const res = await fetch(api, {headers: authHeaders()});
        updateRate(res.headers);
        meta.status = res.status;
        
        if (res.ok) {
            const data = await res.json();
            meta.ok = true;
            meta.current = data?.stargazers_count || null;
            if (meta.current && meta.initial) {
                meta.delta = meta.current - meta.initial;
            }
        }
    } catch {
        meta.status = "error";
    }
    
    return meta;
}

function renderResult(meta) {
    const container = $("#results-container");
    const line = document.createElement("div");
    line.className = "result-line";
    
    const status = meta.ok ? "OK" : "KO";
    const statusClass = meta.ok ? "status-ok" : "status-ko";
    
    let stars = "";
    if (meta.initial) {
        let delta = "";
        if (meta.delta) {
            const sign = meta.delta > 0 ? "+" : "";
            const cls = meta.delta > 0 ? "positive" : "negative";
            delta = ` <span class="delta ${cls}">${sign}${meta.delta}★</span>`;
        }
        stars = `(${meta.initial}★):${delta}`;
    }
    
    line.innerHTML = `<span class="${statusClass}">${status}</span> ${stars} <a href="${meta.html}" target="_blank">${meta.full}</a>`;
    container.appendChild(line);
}

function progressLinks(promises) {
    let done = 0;
    const total = promises.length;
    updateProgress(0, total, "début");
    
    return promises.map(p => 
        p.then(result => {
            done++;
            updateProgress(done, total);
            renderResult(result);
            return result;
        })
    );
}

function displaySummary(results) {
    const ok = results.filter(r => r.ok).length;
    const ko = results.length - ok;
    updateProgress(results.length, results.length, "fini !");
    $("#rate-info").textContent += ` • ${ok} OK / ${ko} KO`;
}

async function run() {
    if (isRunning) return;
    
    isRunning = true;
    const btn = $("#btn-run");
    btn.classList.add("is-loading");
    btn.disabled = true;
    
    const file = $("#file-selector").value;
    $("#results-container").innerHTML = "";
    $("#rate-info").textContent = "";
    updateProgress(0, 1, "téléchargement");
    
    let links = [];
    try {
        const res = await fetch(`data/${file}`, {cache: "no-store"});
        if (!res.ok) throw new Error(res.status);
        links = await res.json();
    } catch {
        updateProgress(0, 0, "erreur JSON");
        isRunning = false;
        btn.classList.remove("is-loading");
        btn.disabled = false;
        return;
    }
    
    if (!Array.isArray(links) || !links.length) {
        updateProgress(0, 0, "fichier vide");
        isRunning = false;
        btn.classList.remove("is-loading");
        btn.disabled = false;
        return;
    }
    
    const promises = links.map(checkLinkAlive);
    const tracked = progressLinks(promises);
    const results = await Promise.all(tracked);
    displaySummary(results);
    
    isRunning = false;
    btn.classList.remove("is-loading");
    btn.disabled = false;
}

$("#btn-run").addEventListener("click", run);
updateProgress(0, 0);