import { createServer } from "node:http";
import { createCanvas, joinSession } from "@github/copilot-sdk/extension";

const repository = "Meghana-2604/workshop1";
const servers = new Map();
let session;

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function scoreIssue(issue) {
    const labels = issue.labels.map((label) => label.name.toLowerCase());
    const urgent = labels.some((label) => ["critical", "urgent", "security", "blocker"].includes(label));
    const ageInDays = (Date.now() - Date.parse(issue.updatedAt)) / 86_400_000;
    return (urgent ? 100 : labels.includes("bug") ? 50 : 0) + issue.comments * 3 + Math.max(0, 30 - ageInDays);
}

function priorityReason(issue, rank) {
    const labels = issue.labels.map((label) => label.name.toLowerCase());
    const reasons = [];
    if (labels.some((label) => ["critical", "urgent", "security", "blocker"].includes(label))) {
        reasons.push("it has an urgent or security-related label");
    } else if (labels.includes("bug")) {
        reasons.push("it is marked as a bug");
    }
    if (issue.comments > 0) reasons.push(`it has ${issue.comments} comment${issue.comments === 1 ? "" : "s"}`);
    reasons.push("it has been updated recently");
    return `Priority ${rank}: ${reasons.join(", ")}.`;
}

async function fetchIssues() {
    const response = await fetch(
        `https://api.github.com/repos/${repository}/issues?state=open&per_page=100`,
        { headers: { Accept: "application/vnd.github+json", "User-Agent": "kanban-triage-canvas" } },
    );
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
    const issues = await response.json();
    return issues
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({
            id: issue.number,
            title: issue.title,
            body: issue.body || "No description provided.",
            url: issue.html_url,
            comments: issue.comments,
            updatedAt: issue.updated_at,
            labels: issue.labels.map((label) => ({ name: label.name, color: label.color })),
        }))
        .sort((left, right) => scoreIssue(right) - scoreIssue(left));
}

function renderCard(issue, reason = "") {
    const labels = issue.labels
        .map((label) => `<span class="label" style="--label-color:#${escapeHtml(label.color)}">${escapeHtml(label.name)}</span>`)
        .join("");
    return `<article class="card">
      <div class="card-heading"><span class="issue-number">#${issue.id}</span><h3>${escapeHtml(issue.title)}</h3></div>
      <div class="labels">${labels}</div>
      <p>${escapeHtml(issue.body)}</p>
      ${reason ? `<p class="reason"><strong>Why it is here:</strong> ${escapeHtml(reason)}</p>` : ""}
      <div class="card-footer"><a href="${escapeHtml(issue.url)}" target="_blank" rel="noreferrer">View on GitHub</a><button data-issue="${issue.id}">Add to current context</button></div>
    </article>`;
}

function renderHtml(issues, error = "") {
    const top = issues.slice(0, 3);
    const remainder = issues.slice(3);
    const topMarkup = top.length
        ? top.map((issue, index) => renderCard(issue, priorityReason(issue, index + 1))).join("")
        : `<p class="empty">${escapeHtml(error || "No open issues found.")}</p>`;
    const remainderMarkup = remainder.length
        ? remainder.map((issue) => renderCard(issue)).join("")
        : `<p class="empty">There are no other open issues.</p>`;
    return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Issue triage board</title>
    <style>
      :root { color-scheme: light dark; --bg: var(--background-color-default,#fff); --text: var(--text-color-default,#1f2328); --muted: var(--text-color-muted,#656d76); --border: var(--border-color-default,#d0d7de); --blue: var(--true-color-blue,#0969da); }
      * { box-sizing: border-box; } body { margin:0; padding:24px; background:var(--bg); color:var(--text); font:14px/1.5 var(--font-sans,system-ui,sans-serif); }
      h1 { margin:0 0 4px; font-size:24px; } h2 { margin:28px 0 12px; font-size:16px; } .subtitle,.empty { color:var(--muted); }
      .board { display:grid; gap:12px; } .card { border:1px solid var(--border); border-radius:10px; padding:16px; background:color-mix(in srgb,var(--bg) 94%,var(--text)); }
      .card-heading { display:flex; gap:8px; align-items:baseline; } h3 { margin:0; font-size:16px; } .issue-number { color:var(--muted); font-family:var(--font-mono,monospace); }
      .labels { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; } .label { border:1px solid var(--label-color); border-radius:999px; padding:1px 8px; font-size:12px; }
      .card p { margin:10px 0; white-space:pre-wrap; } .reason { color:var(--muted); } .card-footer { display:flex; justify-content:space-between; gap:12px; align-items:center; margin-top:14px; }
      a { color:var(--blue); } button { border:1px solid var(--blue); border-radius:6px; padding:6px 10px; color:var(--blue); background:transparent; cursor:pointer; font:inherit; } button:hover,button:focus-visible { background:color-mix(in srgb,var(--blue) 12%,transparent); outline:2px solid var(--blue); outline-offset:2px; } button[data-added="true"] { color:var(--muted); border-color:var(--border); }
    </style>
  </head>
  <body><h1>Issue triage board</h1><div class="subtitle">The three issues most likely to need attention now, followed by the rest.</div>
    <h2>Needs attention now</h2><section class="board">${topMarkup}</section>
    <h2>Remaining open issues</h2><section class="board">${remainderMarkup}</section>
    <script>
      document.querySelectorAll("button[data-issue]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        const response = await fetch("/context", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ issue: Number(button.dataset.issue) }) });
        button.dataset.added = response.ok;
        button.textContent = response.ok ? "Added to context" : "Could not add";
        button.disabled = false;
      }));
    </script>
  </body>
</html>`;
}

async function startServer(instanceId, issues, error) {
    const server = createServer((req, res) => {
        if (req.method === "POST" && req.url === "/context") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", async () => {
                try {
                    const issueNumber = JSON.parse(body).issue;
                    const issue = issues.find((candidate) => candidate.id === issueNumber);
                    if (!issue) throw new Error("Issue is not on this board.");
                    await session.send({ prompt: `Please work on GitHub issue #${issue.id}: ${issue.title}\n${issue.url}\n\n${issue.body}` });
                    res.writeHead(204).end();
                } catch (requestError) {
                    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end(requestError.message);
                }
            });
            return;
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderHtml(issues, error));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

session = await joinSession({
    canvases: [
        createCanvas({
            id: "kanban-triage",
            displayName: "Issue triage board",
            description: "A Kanban board that ranks open repository issues and adds selected issues to the current session context.",
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    let issues = [];
                    let error = "";
                    try {
                        issues = await fetchIssues();
                    } catch (fetchError) {
                        error = `Unable to load issues: ${fetchError.message}`;
                    }
                    entry = await startServer(ctx.instanceId, issues, error);
                    servers.set(ctx.instanceId, entry);
                }
                return { title: "Issue triage board", url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
