//#region src/rt.ts
var e;
function t(t) {
	e = t.react;
}
//#endregion
//#region src/config.ts
var n = "social-export", r = {
	destination: "destination",
	fit: "fit",
	border: "border",
	visibility: "visibility",
	folder: "folder",
	bluesky: "bluesky.account",
	mastodon: "mastodon.account",
	pixelfed: "pixelfed.account"
}, i = 1048576, a = {
	minAspect: 0,
	maxAspect: Infinity
}, o = [
	{
		id: "bluesky",
		label: "Bluesky",
		service: "Bluesky",
		longEdge: 2e3,
		...a,
		maxBytes: 2e6,
		delivery: {
			kind: "post",
			service: "bluesky"
		}
	},
	{
		id: "mastodon",
		label: "Mastodon",
		service: "Mastodon",
		longEdge: 3840,
		maxPixels: 8294400,
		...a,
		maxBytes: 16 * i,
		delivery: {
			kind: "post",
			service: "mastodon"
		}
	},
	{
		id: "pixelfed",
		label: "Pixelfed",
		service: "Pixelfed",
		longEdge: 2048,
		...a,
		maxBytes: 15 * i,
		delivery: {
			kind: "post",
			service: "pixelfed"
		}
	},
	{
		id: "instagram",
		label: "Instagram: its own shape",
		service: "Instagram",
		width: 1080,
		minAspect: 4 / 5,
		maxAspect: 1.91,
		maxBytes: 8 * i,
		delivery: {
			kind: "site",
			url: "https://www.instagram.com/"
		}
	},
	{
		id: "instagram-portrait",
		label: "Instagram: portrait 4:5",
		service: "Instagram",
		width: 1080,
		minAspect: 4 / 5,
		maxAspect: 4 / 5,
		maxBytes: 8 * i,
		delivery: {
			kind: "site",
			url: "https://www.instagram.com/"
		}
	},
	{
		id: "instagram-square",
		label: "Instagram: square",
		service: "Instagram",
		width: 1080,
		minAspect: 1,
		maxAspect: 1,
		maxBytes: 8 * i,
		delivery: {
			kind: "site",
			url: "https://www.instagram.com/"
		}
	},
	{
		id: "instagram-story",
		label: "Instagram: story 9:16",
		service: "Instagram",
		width: 1080,
		minAspect: 9 / 16,
		maxAspect: 9 / 16,
		maxBytes: 8 * i,
		delivery: {
			kind: "site",
			url: "https://www.instagram.com/"
		}
	},
	{
		id: "facebook",
		label: "Facebook",
		service: "Facebook",
		longEdge: 2048,
		...a,
		maxBytes: 8 * i,
		delivery: {
			kind: "site",
			url: "https://www.facebook.com/"
		}
	},
	{
		id: "x",
		label: "X",
		service: "X",
		longEdge: 4096,
		...a,
		maxBytes: 5 * i,
		delivery: {
			kind: "site",
			url: "https://x.com/compose/post"
		}
	},
	{
		id: "threads",
		label: "Threads",
		service: "Threads",
		longEdge: 1440,
		...a,
		maxBytes: 8 * i,
		delivery: {
			kind: "site",
			url: "https://www.threads.net/"
		}
	}
], s = "instagram";
function c(e) {
	return o.find((t) => t.id === e) ?? o.find((e) => e.id === "instagram");
}
var l = {
	white: "#ffffff",
	black: "#000000",
	grey: "#808080"
}, u = {
	defaultProvider: "https://bsky.social",
	maxPhotos: 4,
	maxText: 300,
	appPasswords: "https://bsky.app/settings/app-passwords"
}, d = {
	maxPhotos: 4,
	maxText: 500
}, f = class extends Error {
	kind;
	status;
	code;
	constructor(e, t, n, r) {
		super(t), this.kind = e, this.status = n, this.code = r, this.name = "ServiceError";
	}
};
async function p(e) {
	let t = await e.text().catch(() => "");
	try {
		let n = JSON.parse(t);
		if (typeof n == "object" && n) {
			let t = (e) => e in n ? n[e] : void 0, r = t("error"), i = [
				t("message"),
				t("error_description"),
				r
			].find((e) => typeof e == "string" && e.trim());
			return {
				code: typeof r == "string" ? r : void 0,
				message: String(i ?? `${e.status} ${e.statusText}`)
			};
		}
	} catch {
		if (t.trim() && t.length < 300 && !/^\s*</.test(t)) return { message: t.trim() };
	}
	return { message: `${e.status} ${e.statusText}`.trim() };
}
async function m(e, t, n, r = {}) {
	let i = {
		Accept: "application/json",
		...r.headers
	}, a = r.body;
	r.json === void 0 ? r.form && (i["Content-Type"] = "application/x-www-form-urlencoded", a = new URLSearchParams(r.form).toString()) : (i["Content-Type"] = "application/json", a = JSON.stringify(r.json));
	let o;
	try {
		o = await e(n, {
			method: r.method ?? (a === void 0 ? "GET" : "POST"),
			headers: i,
			body: a,
			signal: r.signal,
			timeoutMs: r.timeoutMs
		});
	} catch (e) {
		throw r.signal?.aborted || e instanceof DOMException && e.name === "AbortError" ? new f("cancelled", "Stopped.") : e instanceof DOMException && e.name === "TimeoutError" ? new f("network", `${t} took too long to answer. Try again.`) : new f("network", `Couldn't reach ${t}. Check your connection and try again.`);
	}
	if (o.ok) return o;
	let { code: s, message: c } = await p(o);
	throw o.status === 429 ? new f("busy", `${t} asks to wait before trying again.`, 429, s) : o.status >= 500 ? new f("busy", `${t} had a problem: ${c}`, o.status, s) : new f("refused", c, o.status, s);
}
async function h(e, t, n, r = {}) {
	return await (await m(e, t, n, r)).json();
}
function g(e) {
	let t = e.trim(), n = /^@?[^@\s/]+@([^@\s/]+)$/.exec(t);
	n && (t = n[1]), /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || (t = `https://${t}`);
	try {
		let e = new URL(t);
		return e.protocol === "https:" && e.hostname.includes(".") ? e.origin : null;
	} catch {
		return null;
	}
}
var _ = (e) => e instanceof Error ? e.message : String(e), v = /https?:\/\/[^\s<>"]+/g, y = /(^|[\s(])#([^\s#.,;:!?()[\]{}"'<>]+)/gu, b = /[.,;:!?)\]}'"]+$/, x = 64, S = new TextEncoder(), C = (e) => S.encode(e).length;
function w(e) {
	let t = [], n = (n, r, i) => t.push({
		index: {
			byteStart: C(e.slice(0, n)),
			byteEnd: C(e.slice(0, r))
		},
		features: [i]
	});
	for (let t of e.matchAll(y)) {
		let e = t[2];
		if (/^\d+$/.test(e) || e.length > x) continue;
		let r = t.index + t[1].length;
		n(r, r + 1 + e.length, {
			$type: "app.bsky.richtext.facet#tag",
			tag: e
		});
	}
	for (let t of e.matchAll(v)) {
		let e = t[0].replace(b, "");
		n(t.index, t.index + e.length, {
			$type: "app.bsky.richtext.facet#link",
			uri: e
		});
	}
	return t.sort((e, t) => e.index.byteStart - t.index.byteStart);
}
var T = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function E(e) {
	let t = 0;
	for (let n of T.segment(e)) t++;
	return t;
}
//#endregion
//#region src/vault.ts
var D = {
	status: "signed-out",
	name: "",
	message: null,
	remembered: !0
};
function ee(e) {
	let t = /* @__PURE__ */ new Map(), n = null, r = () => n ??= e.available().catch(() => !1);
	return {
		available: r,
		async get(n) {
			return t.has(n) ? t.get(n) ?? null : await r() ? e.get(n).catch(() => null) : null;
		},
		async set(n, i) {
			if (await r()) try {
				return await e.set(n, i), t.delete(n), !0;
			} catch {}
			return t.set(n, i), !1;
		},
		async delete(n) {
			t.delete(n), await r() && await e.delete(n).catch(() => {});
		}
	};
}
//#endregion
//#region src/bluesky.ts
var O = "Bluesky", k = "bluesky.refresh", A = "Your Bluesky sign-in has expired or was removed. Sign in again.", j = "Bluesky didn't accept that handle and app password.", M = "Your account asks for a code from email with its main password. Use an app password instead (Bluesky ▸ Settings ▸ Privacy and security ▸ App passwords).";
function N(e) {
	if (typeof e != "object" || !e || !("service" in e) || !Array.isArray(e.service)) return null;
	for (let t of e.service) {
		if (typeof t != "object" || !t) continue;
		let { id: e, serviceEndpoint: n } = t;
		if (typeof e == "string" && e.endsWith("#atproto_pds") && typeof n == "string") try {
			let e = new URL(n);
			if (e.protocol === "https:") return e.origin;
		} catch {
			return null;
		}
	}
	return null;
}
function te(e) {
	let t = e.get(r.bluesky, null);
	if (typeof t != "object" || !t) return null;
	let { handle: n, did: i, pds: a } = t;
	return typeof n == "string" && typeof i == "string" && typeof a == "string" ? {
		handle: n,
		did: i,
		pds: a
	} : null;
}
var P = (e) => e.split("/").pop() ?? "";
function F(e, t) {
	let n = e.network.fetch, i = e.stores.create()(() => D), a = null, o = null, s = null, c = (e, t) => `${e}/xrpc/${t}`;
	async function l(n) {
		a = null, o = null, e.settings.set(r.bluesky, null), await t.delete(k), i.setState({
			...D,
			message: n
		});
	}
	async function d(n, s) {
		a = {
			handle: n.handle,
			did: n.did,
			pds: s
		}, o = n.accessJwt, e.settings.set(r.bluesky, a);
		let c = await t.set(k, n.refreshJwt);
		i.setState({
			status: "signed-in",
			name: `@${n.handle}`,
			message: null,
			remembered: c
		});
	}
	async function p(t, r, a = u.defaultProvider) {
		let o = g(a || u.defaultProvider);
		if (!o) i.setState({
			...D,
			message: "Type your hosting provider's https address, such as bsky.social."
		});
		else {
			i.setState({
				status: "signing-in",
				message: null
			});
			try {
				if (!await e.network.requestAccess(o)) throw new f("refused", `Safelight wasn't allowed to reach ${o}.`);
				let i;
				try {
					i = await h(n, O, c(o, "com.atproto.server.createSession"), { json: {
						identifier: t.trim().replace(/^@/, ""),
						password: r.trim()
					} });
				} catch (e) {
					throw e instanceof f && e.code === "AuthFactorTokenRequired" ? new f("refused", M) : e instanceof f && e.status === 401 ? new f("refused", j) : e;
				}
				let a = N(i.didDoc) ?? o;
				if (!await e.network.requestAccess(a)) throw new f("refused", `Safelight wasn't allowed to reach your Bluesky server, ${a}.`);
				await d(i, a);
			} catch (e) {
				i.setState({
					...D,
					message: e instanceof Error ? e.message : String(e)
				});
			}
		}
	}
	async function m() {
		let n = te(e.settings);
		n && await t.get(k) && (a = n, i.setState({
			status: "signed-in",
			name: `@${n.handle}`,
			message: null,
			remembered: !0
		}));
	}
	function _() {
		return s ??= (async () => {
			let e = await t.get(k);
			if (!a || !e) throw new f("signed-out", A);
			try {
				let t = await h(n, O, c(a.pds, "com.atproto.server.refreshSession"), {
					method: "POST",
					headers: { Authorization: `Bearer ${e}` }
				});
				return await d(t, a.pds), t.accessJwt;
			} catch (e) {
				throw e instanceof f && (e.status === 400 || e.status === 401) ? (await l(A), new f("expired", A, e.status, e.code)) : e;
			}
		})().finally(() => {
			s = null;
		}), s;
	}
	async function v(e, t) {
		if (!a) throw new f("signed-out", "Sign in to Bluesky first.");
		let r = o ?? await _();
		for (let i = 0;; i++) try {
			return await h(n, O, c(a.pds, e), {
				...t,
				headers: {
					...t?.headers,
					Authorization: `Bearer ${r}`
				}
			});
		} catch (e) {
			if (!(e instanceof f && (e.code === "ExpiredToken" || e.code === "InvalidToken" || e.status === 401)) || i > 0) throw e;
			r = await _();
		}
	}
	async function y(e, t) {
		if (e.length > u.maxPhotos) throw new f("refused", `A Bluesky post takes ${u.maxPhotos} photos at most.`);
		let n = [];
		for (let r of e) {
			if (t.signal?.aborted) throw new f("cancelled", "Stopped.");
			let { blob: e } = await v("com.atproto.repo.uploadBlob", {
				method: "POST",
				headers: { "Content-Type": r.blob.type || "image/jpeg" },
				body: new Uint8Array(await r.blob.arrayBuffer()),
				signal: t.signal,
				timeoutMs: 12e4
			});
			n.push({
				image: e,
				alt: r.alt,
				aspectRatio: {
					width: r.width,
					height: r.height
				}
			});
		}
		let r = t.text.trim(), i = w(r), o = await v("com.atproto.repo.createRecord", { json: {
			repo: a?.did,
			collection: "app.bsky.feed.post",
			record: {
				$type: "app.bsky.feed.post",
				text: r,
				...i.length ? { facets: i } : {},
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				embed: {
					$type: "app.bsky.embed.images",
					images: n
				}
			}
		} });
		return { url: `https://bsky.app/profile/${a?.handle ?? ""}/post/${P(o.uri)}` };
	}
	return {
		id: "bluesky",
		store: i,
		signIn: p,
		restore: m,
		signOut: () => l(null),
		limits: async () => ({
			maxPhotos: u.maxPhotos,
			maxText: u.maxText,
			maxBytes: 2e6
		}),
		post: y
	};
}
//#endregion
//#region src/canvas.ts
function I(e) {
	let t = e.getContext("2d", { alpha: !1 });
	if (!t) throw Error("This computer couldn't make a canvas to draw on.");
	return t.imageSmoothingEnabled = !0, t.imageSmoothingQuality = "high", t;
}
var ne = { async compose(e, t, n) {
	let r = await createImageBitmap(e), i = new OffscreenCanvas(t.width, t.height);
	try {
		let e = I(i);
		e.fillStyle = n, e.fillRect(0, 0, t.width, t.height), e.drawImage(r, t.draw.x, t.draw.y, t.draw.w, t.draw.h);
	} finally {
		r.close();
	}
	return {
		width: t.width,
		height: t.height,
		async encode(e, n, r) {
			if (r >= 1) return i.convertToBlob({
				type: e,
				quality: n
			});
			let a = new OffscreenCanvas(Math.max(1, Math.round(t.width * r)), Math.max(1, Math.round(t.height * r)));
			return I(a).drawImage(i, 0, 0, a.width, a.height), a.convertToBlob({
				type: e,
				quality: n
			});
		},
		release() {
			i.width = 0, i.height = 0;
		}
	};
} };
async function L(e) {
	let t = await createImageBitmap(e), n = new OffscreenCanvas(t.width, t.height);
	try {
		I(n).drawImage(t, 0, 0);
	} finally {
		t.close();
	}
	return n.convertToBlob({ type: "image/png" });
}
//#endregion
//#region src/multipart.ts
var R = (e) => e.replace(/[\r\n"\\]/g, (e) => e === "\"" ? "%22" : e === "\\" ? "\\\\" : " ");
function re(e, t = `----SafelightBoundary${crypto.randomUUID().replace(/-/g, "")}`) {
	let n = new TextEncoder(), r = [];
	for (let i of e) {
		let e = `--${t}\r\nContent-Disposition: form-data; name="${R(i.name)}"`;
		"data" in i && (e += `; filename="${R(i.filename)}"\r\nContent-Type: ${i.type}`), r.push(n.encode(`${e}\r\n\r\n`)), r.push("data" in i ? i.data : n.encode(i.value)), r.push(n.encode("\r\n"));
	}
	r.push(n.encode(`--${t}--\r\n`));
	let i = new Uint8Array(r.reduce((e, t) => e + t.length, 0)), a = 0;
	for (let e of r) i.set(e, a), a += e.length;
	return {
		body: i,
		contentType: `multipart/form-data; boundary=${t}`
	};
}
//#endregion
//#region src/mastodon.ts
var z = {
	mastodon: {
		name: "Mastodon",
		scopes: "read:accounts write:media write:statuses",
		settings: r.mastodon,
		maxBytes: 16777216,
		maxPixels: 8294400
	},
	pixelfed: {
		name: "Pixelfed",
		scopes: "read write",
		settings: r.pixelfed,
		maxBytes: 15728640
	}
}, B = "http://127.0.0.1", V = "Safelight", H = "https://github.com/anthonyreimche/SafeLight", U = 3e4, W = 1e3, G = (e, t) => new Promise((n, r) => {
	let i = setTimeout(n, e);
	t?.addEventListener("abort", () => {
		clearTimeout(i), r(new f("cancelled", "Stopped."));
	}, { once: !0 });
}), K = (e) => btoa(String.fromCharCode(...e)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), q = (e = 32) => K(crypto.getRandomValues(new Uint8Array(e)));
async function J() {
	let e = q(64), t = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e));
	return {
		verifier: e,
		challenge: K(new Uint8Array(t))
	};
}
function Y(e, t) {
	let n = e.get(t, null);
	if (typeof n != "object" || !n) return null;
	let { origin: r, acct: i } = n;
	return typeof r == "string" && typeof i == "string" ? {
		origin: r,
		acct: i
	} : null;
}
function X(e, ...t) {
	let n = e;
	for (let e of t) n = typeof n == "object" && n ? n[e] : void 0;
	return typeof n == "number" && n > 0 ? n : void 0;
}
function Z(e, t, n, r = G) {
	let i = z[n], a = i.name, o = `Your ${a} sign-in has expired or was removed. Sign in again.`, s = e.network.fetch, c = e.stores.create()(() => D), l = `${n}.client`, u = `${n}.token`, p = null, m = null, _ = null;
	async function v(n) {
		p = null, _ = null, e.settings.set(i.settings, null), await t.delete(u), c.setState({
			...D,
			message: n
		});
	}
	async function y(e, n) {
		let r = await t.get(l);
		if (r && !n) try {
			let t = JSON.parse(r);
			if (t.origin === e && t.clientId) return t;
		} catch {}
		let o = await h(s, a, `${e}/api/v1/apps`, { form: {
			client_name: V,
			redirect_uris: B,
			scopes: i.scopes,
			website: H
		} }), c = {
			origin: e,
			clientId: o.client_id,
			clientSecret: o.client_secret
		};
		return await t.set(l, JSON.stringify(c)), c;
	}
	async function b(t, n) {
		let { verifier: r, challenge: o } = await J(), c = q(), l = "", u = await e.network.authorizeInBrowser((e) => {
			l = e;
			let n = new URLSearchParams({
				client_id: t.clientId,
				redirect_uri: e,
				response_type: "code",
				scope: i.scopes,
				state: c,
				code_challenge: o,
				code_challenge_method: "S256"
			});
			return `${t.origin}/oauth/authorize?${n}`;
		}, {
			signal: n,
			timeoutMs: 6e5
		});
		if (u.get("error")) throw new f("refused", u.get("error_description") || `${a} didn't allow Safelight in.`, void 0, u.get("error") ?? void 0);
		let d = u.get("code");
		if (u.get("state") !== c || !d) throw new f("refused", `${a} answered the sign-in with something Safelight didn't ask for.`);
		let p = await h(s, a, `${t.origin}/oauth/token`, { form: {
			grant_type: "authorization_code",
			code: d,
			client_id: t.clientId,
			client_secret: t.clientSecret,
			redirect_uri: l,
			code_verifier: r,
			scope: i.scopes
		} });
		if (!p.access_token) throw new f("refused", `${a} answered without an access token.`);
		return p.access_token;
	}
	async function x(r) {
		let o = g(r);
		if (!o) {
			c.setState({
				...D,
				message: `Type your ${a} server's address, such as ${n === "mastodon" ? "mastodon.social" : "pixelfed.social"}.`
			});
			return;
		}
		m?.abort();
		let l = new AbortController();
		m = l, c.setState({
			status: "signing-in",
			message: null
		});
		try {
			if (!await e.network.requestAccess(o)) throw new f("refused", `Safelight wasn't allowed to reach ${o}.`);
			let n;
			try {
				n = await b(await y(o, !1), l.signal);
			} catch (e) {
				if (!(e instanceof f && (e.code === "invalid_client" || e.status === 401))) throw e;
				n = await b(await y(o, !0), l.signal);
			}
			let r = await h(s, a, `${o}/api/v1/accounts/verify_credentials`, { headers: { Authorization: `Bearer ${n}` } });
			p = {
				origin: o,
				acct: `@${r.acct || r.username || ""}@${new URL(o).host}`
			}, e.settings.set(i.settings, p);
			let d = await t.set(u, n);
			c.setState({
				status: "signed-in",
				name: p.acct,
				message: null,
				remembered: d
			});
		} catch (e) {
			let t = l.signal.aborted || e instanceof DOMException && e.name === "AbortError", n = e instanceof DOMException && e.name === "TimeoutError";
			c.setState({
				...D,
				message: t ? null : n ? "The sign-in took too long. Try again." : e instanceof Error ? e.message : String(e)
			});
		} finally {
			m === l && (m = null);
		}
	}
	async function S() {
		let n = Y(e.settings, i.settings);
		n && await t.get(u) && (p = n, c.setState({
			status: "signed-in",
			name: n.acct,
			message: null,
			remembered: !0
		}));
	}
	async function C(e, n = {}) {
		let r = await t.get(u);
		if (!p || !r) throw new f("signed-out", `Sign in to ${a} first.`);
		try {
			return await h(s, a, `${p.origin}${e}`, {
				...n,
				headers: {
					...n.headers,
					Authorization: `Bearer ${r}`
				}
			});
		} catch (e) {
			throw e instanceof f && e.status === 401 ? (await v(o), new f("expired", o, 401)) : e;
		}
	}
	async function w() {
		if (_) return _;
		let e = {
			maxPhotos: d.maxPhotos,
			maxText: d.maxText,
			maxBytes: i.maxBytes,
			maxPixels: i.maxPixels
		};
		if (!p) return e;
		for (let t of ["/api/v2/instance", "/api/v1/instance"]) try {
			let n = await h(s, a, `${p.origin}${t}`), r = ["configuration"];
			return _ = {
				maxPhotos: X(n, ...r, "statuses", "max_media_attachments") ?? e.maxPhotos,
				maxText: X(n, ...r, "statuses", "max_characters") ?? X(n, "max_toot_chars") ?? e.maxText,
				maxBytes: X(n, ...r, "media_attachments", "image_size_limit") ?? e.maxBytes,
				maxPixels: X(n, ...r, "media_attachments", "image_matrix_limit") ?? e.maxPixels
			}, _;
		} catch {}
		return e;
	}
	async function T(e, t, n) {
		let { body: i, contentType: o } = re([{
			name: "file",
			filename: t,
			type: e.blob.type || "image/jpeg",
			data: new Uint8Array(await e.blob.arrayBuffer())
		}, ...e.alt.trim() ? [{
			name: "description",
			value: e.alt.trim()
		}] : []]), s = {
			method: "POST",
			headers: { "Content-Type": o },
			body: i,
			signal: n,
			timeoutMs: 12e4
		}, c;
		try {
			c = await C("/api/v2/media", s);
		} catch (e) {
			if (!(e instanceof f && e.status === 404)) throw e;
			c = await C("/api/v1/media", s);
		}
		for (let e = 0; !c.url; e += W) {
			if (e >= U) throw new f("busy", `${a} is still processing a photo. Try again in a minute.`);
			await r(W, n), c = await C(`/api/v1/media/${encodeURIComponent(c.id)}`, { signal: n });
		}
		return c.id;
	}
	async function E(e, t) {
		let n = (await w()).maxPhotos;
		if (e.length > n) throw new f("refused", `A post on this ${a} server takes ${n} photos at most.`);
		let r = [];
		for (let [n, i] of e.entries()) {
			if (t.signal?.aborted) throw new f("cancelled", "Stopped.");
			r.push(await T(i, `photo-${n + 1}.jpg`, t.signal));
		}
		let i = t.warning?.trim() ?? "", o = await C("/api/v1/statuses", {
			headers: { "Idempotency-Key": q(16) },
			json: {
				status: t.text.trim(),
				media_ids: r,
				visibility: t.visibility ?? "public",
				sensitive: !!(t.sensitive || i),
				...i ? { spoiler_text: i } : {}
			}
		});
		return { url: o.url ?? o.uri ?? null };
	}
	return {
		id: n,
		store: c,
		signIn: x,
		cancelSignIn: () => m?.abort(),
		restore: S,
		signOut: () => v(null),
		limits: w,
		post: E
	};
}
//#endregion
//#region src/save.ts
var ie = "social-export", ae = {
	gone: "The folder for shared photos isn't there any more. Choose another.",
	unwritable: "Safelight can't write into the folder for shared photos. Choose another.",
	unknown: "Choose a folder for shared photos."
};
async function oe(e) {
	let t = /* @__PURE__ */ new Set();
	for await (let n of e.keys()) t.add(n.toLowerCase());
	return t;
}
function se(e, t) {
	let n = t.lastIndexOf("."), [r, i] = n > 0 ? [t.slice(0, n), t.slice(n)] : [t, ""], a = t;
	for (let t = 2; e.has(a.toLowerCase()); t++) a = `${r} (${t})${i}`;
	return e.add(a.toLowerCase()), a;
}
function ce(e) {
	let t = () => e.settings.get(r.folder, null);
	async function n() {
		let n = t(), i = await e.project.pickKeptDirectory(ie, n);
		return i ? (e.settings.set(r.folder, i.token), n && n !== i.token && await e.project.forgetKeptDirectory(n).catch(() => {}), i.folder) : null;
	}
	async function i() {
		let r = t();
		if (r) {
			let t = await e.project.openKeptDirectory(r);
			if ("folder" in t) return t.folder;
			await e.ui.alertDialog({
				title: "Folder for shared photos",
				message: ae[t.problem]
			});
		}
		return n();
	}
	async function a() {
		let n = t();
		if (!n) return null;
		let r = await e.project.openKeptDirectory(n).catch(() => null);
		return r && "folder" in r ? r.folder.name : null;
	}
	async function o(t) {
		let n = await i();
		if (!n) return null;
		let r = [], a = await oe(n);
		for (let e of t) {
			let t = se(a, e.name), i = await (await n.getFileHandle(t, { create: !0 })).createWritable();
			try {
				await i.write(e.blob);
			} finally {
				await i.close();
			}
			r.push(t);
		}
		let o = e.project.pathOf(n), s = o?.includes("\\") ? "\\" : "/";
		return {
			names: r,
			firstPath: o && r[0] ? `${o.replace(/[\\/]+$/, "")}${s}${r[0]}` : o,
			folderName: n.name
		};
	}
	return {
		save: o,
		choose: n,
		folderName: a
	};
}
//#endregion
//#region src/plan.ts
var le = .005, ue = .75, de = (e, t, n) => Math.min(n, Math.max(t, e));
function fe(e, t, n, r, i) {
	let a, o;
	if (e.width) a = e.width, o = Math.round(a / t);
	else {
		let s = e.longEdge ?? Math.max(n, r);
		[a, o] = t >= 1 ? [s, Math.round(s / t)] : [Math.round(s * t), s], i && Math.max(n, r) < s && ([a, o] = [n, r]);
	}
	if (e.maxPixels && a * o > e.maxPixels) {
		let t = Math.sqrt(e.maxPixels / (a * o));
		[a, o] = [Math.floor(a * t), Math.floor(o * t)];
	}
	return [a, o];
}
function pe(e, t, n, r) {
	let i = t / n, a = de(i, e.minAspect, e.maxAspect), o = Math.abs(a / i - 1) <= le, [s, c] = fe(e, o ? i : a, t, n, o);
	if (o) return {
		width: s,
		height: c,
		draw: {
			x: 0,
			y: 0,
			w: s,
			h: c
		},
		scale: s / t
	};
	let l = r === "crop" ? Math.max(s / t, c / n) : Math.min(s / t, c / n), u = t * l, d = n * l;
	return {
		width: s,
		height: c,
		draw: {
			x: (s - u) / 2,
			y: (c - d) / 2,
			w: u,
			h: d
		},
		scale: l
	};
}
function me(e) {
	return e.width ? Math.round(e.width / Math.min(1, e.minAspect || 1)) : e.longEdge ?? 2048;
}
function he(e, t, n) {
	return n > 1.005 || n < ue ? Math.ceil(Math.max(e, t) * n) : null;
}
//#endregion
//#region src/prepare.ts
var ge = [
	.92,
	.86,
	.8,
	.74,
	.68,
	.6
], _e = 4, ve = "Safelight couldn't render it.", ye = (e) => e instanceof Error ? e.message : String(e);
async function be(e, t) {
	let n = 1;
	for (let r = 0; r <= _e; r++) {
		let r = 0;
		for (let i of ge) {
			let a = await e.encode("image/jpeg", i, n);
			if (a.size <= t) return {
				blob: a,
				width: Math.round(e.width * n),
				height: Math.round(e.height * n),
				quality: i
			};
			r = a.size;
		}
		n *= Math.sqrt(t / r) * .95;
	}
	throw Error("It stays too large for the service even when made smaller.");
}
function xe(e, t) {
	let n = e.lastIndexOf(".");
	return `${n > 0 ? e.slice(0, n) : e}_${t}.jpg`;
}
async function Se(e, t, n, r) {
	let i = r.nameOf ?? ((e) => e.filename), a = [], o = (e) => ({
		format: "image/png",
		colorSpace: "srgb",
		longEdge: e
	}), s = /* @__PURE__ */ new Map();
	for (let n of await r.render(e, o(me(t)))) s.set(n.photo.id, n);
	let c = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = s.get(r.id);
		if (!e?.blob) continue;
		let i = he(e.width, e.height, pe(t, e.width, e.height, n.fit).scale);
		i !== null && c.set(i, [...c.get(i) ?? [], r]);
	}
	for (let [e, t] of c) {
		if (r.signal?.aborted) break;
		for (let n of await r.render(t, o(e))) n.blob && s.set(n.photo.id, n);
	}
	let l = [];
	for (let [o, c] of e.entries()) {
		if (r.signal?.aborted) break;
		let u = s.get(c.id);
		if (!u?.blob) {
			a.push({
				name: i(c),
				reason: ve
			}), r.onProgress?.(o + 1, e.length);
			continue;
		}
		let d = null;
		try {
			d = await r.imaging.compose(u.blob, pe(t, u.width, u.height, n.fit), n.border);
			let e = await be(d, t.maxBytes);
			l.push({
				photo: c,
				name: xe(i(c), t.id),
				blob: e.blob,
				width: e.width,
				height: e.height
			});
		} catch (e) {
			a.push({
				name: i(c),
				reason: ye(e)
			});
		} finally {
			d?.release();
		}
		r.onProgress?.(o + 1, e.length);
	}
	return {
		ready: l,
		failed: a
	};
}
//#endregion
//#region src/share.ts
var Q = (e, t, n = `${t}s`) => `${e} ${e === 1 ? t : n}`, Ce = {
	update: () => {},
	close: () => {}
};
function we(e) {
	let t = e.ui;
	return "notify" in t && typeof t.notify == "function" ? (e) => t.notify?.(e) ?? Ce : () => Ce;
}
function Te({ api: e, imaging: t, saver: n, posters: r, copy: i }) {
	let a = e.stores.create()(() => ({
		busy: null,
		last: null
	})), o = null;
	async function s(t, r, a, s) {
		let c = r.destination.service;
		if (t === "post") {
			if (!s) throw Error(`${c} takes posts from Safelight in a later version. Use Save and open.`);
			let e = a.map((e) => ({
				blob: e.blob,
				width: e.width,
				height: e.height,
				alt: r.alt[e.photo.id] ?? ""
			})), { url: t } = await s.post(e, {
				...r.post,
				signal: o?.signal
			});
			return {
				ok: !0,
				message: `Posted ${Q(a.length, "photo")} to ${c}.`,
				url: t
			};
		}
		if (t === "copy") return await i(a[0].blob), {
			ok: !0,
			message: `Copied, sized for ${c}. Paste it into your post.`
		};
		let l = await n.save(a.map((e) => ({
			name: e.name,
			blob: e.blob
		})));
		return l ? (l.firstPath && await e.project.reveal(l.firstPath), t === "save-open" && r.destination.delivery.kind === "site" && window.open(r.destination.delivery.url, "_blank"), {
			ok: !0,
			message: `Saved ${Q(l.names.length, "photo")} for ${c} in ${l.folderName}.`
		}) : {
			ok: !1,
			message: "Nothing was saved: no folder was chosen."
		};
	}
	async function c(e, t, n) {
		if (!t.photos.length) throw Error("Select the photos to share first.");
		if (e === "copy" && t.photos.length > 1) throw Error("Copy takes one photo at a time.");
		if (e !== "post" || !n) return t.destination;
		if (n.store.getState().status !== "signed-in") throw Error(`Sign in to ${t.destination.service} first.`);
		let r = await n.limits();
		if (t.photos.length > r.maxPhotos) throw Error(`A ${t.destination.service} post takes ${r.maxPhotos} photos at most.`);
		if (E(t.post.text.trim()) > r.maxText) throw Error(`${t.destination.service} takes ${r.maxText} characters at most.`);
		return {
			...t.destination,
			maxBytes: Math.min(t.destination.maxBytes, r.maxBytes),
			maxPixels: r.maxPixels ?? t.destination.maxPixels
		};
	}
	async function l(n, i) {
		if (a.getState().busy) return {
			ok: !1,
			message: "A share is already under way.",
			failed: []
		};
		let l = i.destination.delivery.kind === "post" ? r[i.destination.delivery.service] : void 0;
		o = new AbortController(), a.setState({
			busy: n,
			last: null
		});
		let u = we(e)({
			message: `Preparing ${Q(i.photos.length, "photo")} for ${i.destination.service}…`,
			progress: 0
		}), d;
		try {
			let r = await c(n, i, l), a = await Se(i.photos, r, {
				fit: i.fit,
				border: i.border
			}, {
				render: (t, n) => e.export.renderPhotos(t, n, void 0, { signal: o?.signal }),
				imaging: t,
				nameOf: (t) => e.catalog.photoDisplayName(t),
				signal: o.signal,
				onProgress: (e, t) => u.update({ progress: e / t * (n === "post" ? .5 : .9) })
			});
			if (o.signal.aborted) throw new f("cancelled", "Stopped.");
			if (!a.ready.length) throw Error(a.failed[0]?.reason ?? "Nothing could be prepared.");
			if (n === "post" && a.failed.length) throw Error(`${a.failed.length} of the photos couldn't be prepared, so nothing was posted: ${a.failed[0].reason}`);
			n === "post" && u.update({
				message: `Posting to ${i.destination.service}…`,
				progress: .6
			}), d = {
				...await s(n, i, a.ready, l),
				failed: a.failed
			}, a.failed.length && (d.message += ` ${Q(a.failed.length, "photo")} couldn't be prepared.`);
		} catch (e) {
			d = {
				ok: !1,
				message: e instanceof f && e.kind === "cancelled" ? "Stopped." : _(e),
				failed: []
			};
		}
		return u.update({
			message: d.message,
			progress: null,
			tone: d.ok ? d.failed.length ? "warning" : "success" : "error"
		}), a.setState({
			busy: null,
			last: d
		}), o = null, d;
	}
	return {
		store: a,
		run: l,
		cancel: () => o?.abort()
	};
}
async function Ee(e) {
	await navigator.clipboard.write([new ClipboardItem({ "image/png": e })]);
}
//#endregion
//#region src/ShareWindow.tsx
var De = [
	{
		value: "public",
		label: "Public"
	},
	{
		value: "unlisted",
		label: "Unlisted"
	},
	{
		value: "private",
		label: "Followers only"
	}
], Oe = (e) => e.minAspect > 0 || Number.isFinite(e.maxAspect), ke = (e, t) => Math.min(e.maxAspect, Math.max(e.minAspect, t));
function $(t, n, r) {
	let [i, a] = e.useState(() => t.settings.get(n, r));
	return [i, e.useCallback((e) => {
		a(e), t.settings.set(n, e);
	}, [t, n])];
}
function Ae(t) {
	let { api: n } = t, { Button: i, Select: a, TextInput: d, TextArea: f, SegmentedControl: p, Section: m, Stack: h, Row: g, ProgressBar: _, tokens: v } = n.ui, y = {
		margin: 0,
		fontSize: 11,
		lineHeight: 1.45,
		color: v.textSecondary
	}, b = {
		...y,
		color: v.textMuted
	};
	function x() {
		let r = t.pinned((e) => e.ids), i = n.stores.useCatalogStore((e) => e.photos), a = n.stores.useCatalogStore((e) => e.selectedIds), o = n.catalog.useActivePhoto();
		return e.useMemo(() => {
			let e = new Set(r ?? (a.size ? a : o ? [o.id] : []));
			return i.filter((t) => e.has(t.id));
		}, [
			r,
			a,
			o,
			i
		]);
	}
	function S({ photo: t, dest: r, fit: i, border: a }) {
		let [o, s] = e.useState(t.width && t.height ? t.width / t.height : 1.5);
		e.useEffect(() => {
			t.thumbnailUrl || n.catalog.requestThumbnail(t.id);
		}, [t.id, t.thumbnailUrl]);
		let c = ke(r, o), l = c >= 1 ? {
			width: 72,
			height: 72 / c
		} : {
			width: 72 * c,
			height: 72
		};
		return /* @__PURE__ */ e.createElement("div", {
			title: Oe(r) ? `As ${r.service} will show it` : void 0,
			style: {
				...l,
				flex: "none",
				background: i === "border" ? a : v.surface2,
				overflow: "hidden",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				outline: `1px solid ${v.borderSubtle}`
			}
		}, t.thumbnailUrl ? /* @__PURE__ */ e.createElement("img", {
			src: t.thumbnailUrl,
			alt: "",
			onLoad: (e) => e.currentTarget.naturalHeight && s(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight),
			style: {
				width: "100%",
				height: "100%",
				objectFit: i === "crop" ? "cover" : "contain"
			}
		}) : null);
	}
	function C() {
		let n = t.bluesky.store((e) => e), [r, a] = e.useState(""), [o, s] = e.useState(""), [c, l] = e.useState(u.defaultProvider);
		if (n.status === "signed-in") return /* @__PURE__ */ e.createElement(T, {
			name: n.name,
			remembered: n.remembered,
			onSignOut: () => void t.bluesky.signOut()
		});
		let f = n.status === "signing-in", p = () => {
			!f && r.trim() && o.trim() && t.bluesky.signIn(r, o, c.trim() || u.defaultProvider).then(() => s(""));
		};
		return /* @__PURE__ */ e.createElement(h, { gap: 6 }, n.message ? /* @__PURE__ */ e.createElement("p", { style: y }, n.message) : null, /* @__PURE__ */ e.createElement(d, {
			"aria-label": "Bluesky handle",
			placeholder: "Handle, such as you.bsky.social",
			value: r,
			onChange: a,
			disabled: f
		}), /* @__PURE__ */ e.createElement(d, {
			"aria-label": "App password",
			type: "password",
			placeholder: "App password",
			title: "Make one in Bluesky ▸ Settings ▸ Privacy and security ▸ App passwords. It can post for you but can't change your account.",
			value: o,
			onChange: s,
			disabled: f,
			onKeyDown: (e) => e.key === "Enter" && p()
		}), /* @__PURE__ */ e.createElement(d, {
			"aria-label": "Hosting provider",
			title: "Where your account is hosted. Leave it as it is unless you run your own server.",
			value: c,
			onChange: l,
			disabled: f
		}), /* @__PURE__ */ e.createElement(g, { gap: 6 }, /* @__PURE__ */ e.createElement(i, {
			variant: "primary",
			disabled: f || !r.trim() || !o.trim(),
			onClick: p
		}, "Sign in"), /* @__PURE__ */ e.createElement(i, {
			variant: "ghost",
			onClick: () => window.open(u.appPasswords, "_blank")
		}, "Make an app password")));
	}
	function w({ service: t, example: n }) {
		let r = t.store((e) => e), [a, o] = e.useState("");
		if (r.status === "signed-in") return /* @__PURE__ */ e.createElement(T, {
			name: r.name,
			remembered: r.remembered,
			onSignOut: () => void t.signOut()
		});
		if (r.status === "signing-in") return /* @__PURE__ */ e.createElement(g, {
			justify: "space-between",
			align: "center",
			gap: 6
		}, /* @__PURE__ */ e.createElement("p", { style: y }, "Finish signing in in your browser."), /* @__PURE__ */ e.createElement(i, {
			size: "sm",
			onClick: t.cancelSignIn
		}, "Cancel"));
		let s = () => {
			a.trim() && t.signIn(a);
		};
		return /* @__PURE__ */ e.createElement(h, { gap: 6 }, r.message ? /* @__PURE__ */ e.createElement("p", { style: y }, r.message) : null, /* @__PURE__ */ e.createElement(g, { gap: 6 }, /* @__PURE__ */ e.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ e.createElement(d, {
			"aria-label": "Server",
			placeholder: `Your server, such as ${n}`,
			value: a,
			onChange: o,
			onKeyDown: (e) => e.key === "Enter" && s()
		})), /* @__PURE__ */ e.createElement(i, {
			variant: "primary",
			disabled: !a.trim(),
			onClick: s,
			title: "Opens your server's sign-in page in your browser"
		}, "Sign in")));
	}
	function T({ name: t, remembered: n, onSignOut: r }) {
		return /* @__PURE__ */ e.createElement(h, { gap: 4 }, /* @__PURE__ */ e.createElement(g, {
			justify: "space-between",
			align: "center",
			gap: 6
		}, /* @__PURE__ */ e.createElement("span", { style: {
			fontSize: 12,
			color: v.textPrimary,
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		} }, t), /* @__PURE__ */ e.createElement(i, {
			size: "sm",
			variant: "ghost",
			onClick: r
		}, "Sign out")), n ? null : /* @__PURE__ */ e.createElement("p", { style: b }, "This computer has no keychain to keep the sign-in, so it lasts until Safelight closes."));
	}
	function D(e) {
		return e.delivery.kind === "post" ? t[e.delivery.service] : null;
	}
	function ee(t, n) {
		let [r, i] = e.useState(null);
		return e.useEffect(() => {
			let e = !0;
			return i(null), t && n && t.limits().then((t) => e && i(t.maxText)).catch(() => {}), () => {
				e = !1;
			};
		}, [t, n]), r;
	}
	function O() {
		let [n, r] = e.useState(null), a = t.sharer.store((e) => e.last);
		return e.useEffect(() => {
			let e = !0;
			return t.saver.folderName().then((t) => e && r(t)), () => {
				e = !1;
			};
		}, [a]), /* @__PURE__ */ e.createElement(g, {
			justify: "space-between",
			align: "center",
			gap: 6
		}, /* @__PURE__ */ e.createElement("span", {
			style: {
				...y,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			},
			title: "Where saved photos go"
		}, n ? `Saves to ${n}` : "You'll choose a folder the first time you save."), /* @__PURE__ */ e.createElement(i, {
			size: "sm",
			variant: "ghost",
			onClick: () => void t.saver.choose().then((e) => e && r(e.name))
		}, n ? "Change folder" : "Choose folder"));
	}
	return function() {
		let T = x(), [k, A] = $(n, r.destination, s), [j, M] = $(n, r.fit, "border"), [N, te] = $(n, r.border, "white"), [P, F] = $(n, r.visibility, "public"), [I, ne] = e.useState(""), [L, R] = e.useState(""), [re, z] = e.useState({}), B = t.sharer.store((e) => e.busy), V = t.sharer.store((e) => e.last), H = c(k), U = D(H), W = {
			bluesky: t.bluesky.store((e) => e.status),
			mastodon: t.mastodon.store((e) => e.status),
			pixelfed: t.pixelfed.store((e) => e.status)
		}, G = H.delivery.kind === "post" && W[H.delivery.service] === "signed-in", K = ee(U, G) ?? (H.id === "bluesky" ? u.maxText : null), q = l[N] ?? l.white, J = (e) => re[e.id] ?? e.exif?.imageDescription ?? "", Y = E(I.trim()), X = K !== null && Y > K, Z = (e) => void t.sharer.run(e, {
			photos: T,
			destination: H,
			fit: j,
			border: q,
			alt: Object.fromEntries(T.map((e) => [e.id, J(e)])),
			post: {
				text: I,
				visibility: P,
				warning: H.id === "bluesky" ? void 0 : L
			}
		}), ie = [{
			title: "Post from Safelight",
			items: o.filter((e) => e.delivery.kind === "post").map((e) => ({
				value: e.id,
				label: e.label
			}))
		}, {
			title: "Save, then upload on the site",
			items: o.filter((e) => e.delivery.kind === "site").map((e) => ({
				value: e.id,
				label: e.label
			}))
		}];
		return T.length ? /* @__PURE__ */ e.createElement("div", { style: {
			display: "flex",
			height: "100%",
			minHeight: 0,
			color: v.textPrimary
		} }, /* @__PURE__ */ e.createElement("div", { style: {
			width: 340,
			flex: "none",
			overflowY: "auto",
			padding: 12,
			borderRight: `1px solid ${v.borderSubtle}`
		} }, /* @__PURE__ */ e.createElement(h, { gap: 10 }, T.map((t) => /* @__PURE__ */ e.createElement(g, {
			key: t.id,
			gap: 10,
			align: "flex-start"
		}, /* @__PURE__ */ e.createElement(S, {
			photo: t,
			dest: H,
			fit: j,
			border: q
		}), /* @__PURE__ */ e.createElement(h, {
			gap: 4,
			style: {
				flex: 1,
				minWidth: 0
			}
		}, /* @__PURE__ */ e.createElement("span", { style: {
			fontSize: 12,
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		} }, n.catalog.photoDisplayName(t)), U ? /* @__PURE__ */ e.createElement(f, {
			"aria-label": `Alt text for ${t.filename}`,
			placeholder: "Alt text",
			title: "Describes the photo for people who can't see it. Starts from the photo's caption.",
			rows: 2,
			value: J(t),
			onChange: (e) => z((n) => ({
				...n,
				[t.id]: e
			}))
		}) : null))))), /* @__PURE__ */ e.createElement("div", { style: {
			flex: 1,
			minWidth: 300,
			overflowY: "auto",
			padding: 12
		} }, /* @__PURE__ */ e.createElement(h, { gap: 12 }, /* @__PURE__ */ e.createElement(m, { title: "Destination" }, /* @__PURE__ */ e.createElement(h, { gap: 8 }, /* @__PURE__ */ e.createElement(a, {
			ariaLabel: "Destination",
			value: H.id,
			onChange: A,
			groups: ie
		}), Oe(H) ? /* @__PURE__ */ e.createElement(g, {
			gap: 8,
			align: "center",
			wrap: !0
		}, /* @__PURE__ */ e.createElement("span", { title: "What fills the frame when a photo's shape isn't one the destination shows" }, /* @__PURE__ */ e.createElement(p, {
			size: "sm",
			value: j,
			onChange: (e) => M(e === "crop" ? "crop" : "border"),
			options: [{
				value: "border",
				label: "Border"
			}, {
				value: "crop",
				label: "Crop"
			}]
		})), j === "border" ? /* @__PURE__ */ e.createElement("span", { title: "Border colour" }, /* @__PURE__ */ e.createElement(p, {
			size: "sm",
			value: N,
			onChange: (e) => te(e in l ? e : "white"),
			options: [
				{
					value: "white",
					label: "White"
				},
				{
					value: "grey",
					label: "Grey"
				},
				{
					value: "black",
					label: "Black"
				}
			]
		})) : null) : null)), H.delivery.kind === "post" ? /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement(m, { title: "Account" }, H.delivery.service === "bluesky" ? /* @__PURE__ */ e.createElement(C, null) : /* @__PURE__ */ e.createElement(w, {
			service: H.delivery.service === "mastodon" ? t.mastodon : t.pixelfed,
			example: H.delivery.service === "mastodon" ? "mastodon.social" : "pixelfed.social"
		})), /* @__PURE__ */ e.createElement(m, {
			title: "Post",
			right: K === null ? null : /* @__PURE__ */ e.createElement("span", { style: {
				...y,
				color: X ? v.labelRed : v.textMuted
			} }, `${Y} / ${K}`)
		}, /* @__PURE__ */ e.createElement(h, { gap: 6 }, /* @__PURE__ */ e.createElement(f, {
			"aria-label": "Post text",
			placeholder: "Say something about it",
			rows: 4,
			value: I,
			onChange: ne
		}), H.id === "bluesky" ? null : /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement(a, {
			ariaLabel: "Who can see it",
			title: "Who can see the post",
			value: P,
			onChange: (e) => F(e),
			options: De
		}), /* @__PURE__ */ e.createElement(d, {
			"aria-label": "Content warning",
			placeholder: "Content warning (optional)",
			title: "Hides the photos behind this text until someone opens them",
			value: L,
			onChange: R
		}))))) : /* @__PURE__ */ e.createElement(m, { title: "Folder" }, /* @__PURE__ */ e.createElement(O, null)), /* @__PURE__ */ e.createElement(h, { gap: 6 }, B ? /* @__PURE__ */ e.createElement(g, {
			gap: 8,
			align: "center"
		}, /* @__PURE__ */ e.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ e.createElement(_, {
			indeterminate: !0,
			label: "Sharing"
		})), /* @__PURE__ */ e.createElement(i, {
			size: "sm",
			onClick: t.sharer.cancel
		}, "Stop")) : /* @__PURE__ */ e.createElement(g, {
			gap: 6,
			wrap: !0
		}, U ? /* @__PURE__ */ e.createElement(i, {
			variant: "primary",
			disabled: !G || X,
			onClick: () => Z("post"),
			title: G ? void 0 : `Sign in to ${H.service} first`
		}, T.length > 1 ? `Post ${T.length} photos` : "Post") : /* @__PURE__ */ e.createElement(i, {
			variant: "primary",
			onClick: () => Z("save-open"),
			title: `Saves the photos, shows them in your file manager and opens ${H.service}`
		}, "Save and open ", H.service), U ? null : /* @__PURE__ */ e.createElement(i, {
			onClick: () => Z("save"),
			title: "Saves the photos without opening the site"
		}, "Save"), /* @__PURE__ */ e.createElement(i, {
			onClick: () => Z("copy"),
			disabled: T.length !== 1,
			title: T.length === 1 ? "Copies the photo, sized for this destination, to paste into a post" : "Copy takes one photo at a time"
		}, "Copy")), V && !B ? /* @__PURE__ */ e.createElement(g, {
			gap: 6,
			align: "center",
			wrap: !0
		}, /* @__PURE__ */ e.createElement("p", { style: {
			...y,
			color: V.ok ? v.textSecondary : v.labelRed
		} }, V.message), V.url ? /* @__PURE__ */ e.createElement(i, {
			size: "sm",
			variant: "ghost",
			onClick: () => window.open(V.url ?? "", "_blank")
		}, "Open post") : null) : null, V?.failed.length ? /* @__PURE__ */ e.createElement("ul", { style: {
			...b,
			paddingLeft: 14,
			margin: 0
		} }, V.failed.map((t, n) => /* @__PURE__ */ e.createElement("li", { key: `${t.name}-${n}` }, t.name, ": ", t.reason))) : null)))) : /* @__PURE__ */ e.createElement("div", { style: { padding: 24 } }, /* @__PURE__ */ e.createElement("p", { style: y }, "Select photos in the Library to share them."));
	};
}
//#endregion
//#region src/service.ts
var je = `${n}.share`, Me = `${n}.share`, Ne = `${n}.share`, Pe = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M12 2.6l4.7 4.7-1.4 1.4L13 6.4V15h-2V6.4L8.7 8.7 7.3 7.3z\"/><path d=\"M5 10h3v2H6v8h12v-8h-2v-2h3a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V11a1 1 0 011-1z\"/></svg>";
function Fe(e, t = {}) {
	let n = ee(e.secrets), r = F(e, n), i = Z(e, n, "mastodon"), a = Z(e, n, "pixelfed"), o = ce(e), s = Te({
		api: e,
		imaging: t.imaging ?? ne,
		saver: o,
		posters: {
			bluesky: r,
			mastodon: i,
			pixelfed: a
		},
		copy: t.copy ?? (async (e) => Ee(await L(e)))
	}), c = e.stores.create()(() => ({ ids: null }));
	function l(t) {
		c.setState({ ids: t }), e.windows.open(je);
	}
	function u() {
		e.registerWindow({
			id: je,
			title: "Share",
			component: Ae({
				api: e,
				sharer: s,
				saver: o,
				bluesky: r,
				mastodon: i,
				pixelfed: a,
				pinned: c
			}),
			maximizable: !0
		}), e.registerGridMenuItem({
			id: Me,
			label: (e) => e.length > 1 ? `Share ${e.length} photos…` : "Share…",
			onClick: (e) => l(e)
		}), e.registerTopBarButton({
			id: Ne,
			label: "Share",
			svg: Pe,
			onClick: () => l(null)
		});
	}
	async function d() {
		await Promise.all([
			r.restore(),
			i.restore(),
			a.restore()
		]);
	}
	return {
		api: e,
		bluesky: r,
		mastodon: i,
		pixelfed: a,
		saver: o,
		sharer: s,
		pinned: c,
		open: l,
		register: u,
		restore: d
	};
}
//#endregion
//#region src/index.tsx
function Ie(e, n) {
	t(e);
	let r = Fe(e, n);
	r.register(), r.restore();
}
//#endregion
export { Ie as activate };

//# sourceMappingURL=index.js.map