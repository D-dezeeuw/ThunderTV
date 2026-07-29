import { getPlatform } from '../core/platform';
import { canonicalize, type CodexAuthor, type CodexBody, type CodexDocument } from './format';

/**
 * Codex signing — ECDSA P-256 via WebCrypto, no dependencies.
 *
 * **What a signature here does and does not prove.** It proves that a
 * Codex has not been altered since whoever holds this key wrote it, and
 * that two Codexes carrying the same author id came from the same
 * keypair. It proves nothing about who that is or whether they are worth
 * believing — the vision's trust model (evidence weight, retroactive
 * pruning of a bad contributor) is stone 10, and it is built *on top of*
 * this identity, not by it. Anything in the UI that presents a valid
 * signature must say the narrow thing, not "verified".
 *
 * The keypair is generated once, on first export, and persisted as JWK.
 * P-256 rather than Ed25519 because it is the curve every target engine's
 * WebCrypto actually implements today, including the older TV webviews
 * Phase 30 targets.
 */

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN_PARAMS = { name: 'ECDSA', hash: 'SHA-256' } as const;

/** kv keys for the device's own identity. The private key never leaves this device — nothing exports it, and no Codex contains it. */
const PRIVATE_KEY_KEY = 'codex.identity.privateKey';
const PUBLIC_KEY_KEY = 'codex.identity.publicKey';

export interface CodexIdentity {
    author: CodexAuthor;
    privateKey: CryptoKey;
}

function subtle(): SubtleCrypto {
    const available = globalThis.crypto?.subtle;
    if (!available) {
        throw new Error('WebCrypto is unavailable, so a Codex cannot be signed or verified on this device');
    }
    return available;
}

/** True when this device can sign/verify at all — lets the UI hide the feature rather than offer a button that throws. */
export function codexCryptoAvailable(): boolean {
    return typeof globalThis.crypto?.subtle?.sign === 'function';
}

/**
 * A short, stable fingerprint of the public key: the first 16 hex
 * characters of its SHA-256. Short enough to show and compare by eye,
 * long enough that colliding with another contributor is not a practical
 * concern for a format shared by hand.
 */
export async function fingerprint(publicKey: JsonWebKey): Promise<string> {
    const bytes = new TextEncoder().encode(canonicalize(publicKey));
    const digest = await subtle().digest('SHA-256', bytes);
    return [...new Uint8Array(digest)]
        .slice(0, 8)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

/** Loads this device's Codex identity, generating and persisting one on first use. */
export async function loadOrCreateIdentity(): Promise<CodexIdentity> {
    const storage = getPlatform().storage;
    const [storedPrivate, storedPublic] = await Promise.all([
        storage.get<JsonWebKey>(PRIVATE_KEY_KEY),
        storage.get<JsonWebKey>(PUBLIC_KEY_KEY),
    ]);

    if (storedPrivate && storedPublic) {
        const privateKey = await subtle().importKey('jwk', storedPrivate, ALGORITHM, true, ['sign']);
        return { author: { id: await fingerprint(storedPublic), publicKey: storedPublic }, privateKey };
    }

    const pair = await subtle().generateKey(ALGORITHM, true, ['sign', 'verify']);
    const publicJwk = await subtle().exportKey('jwk', pair.publicKey);
    const privateJwk = await subtle().exportKey('jwk', pair.privateKey);
    // Best-effort persistence: a device on the memory tier still gets a
    // working identity for this session rather than no export at all — it
    // simply signs under a new author id next time.
    await storage.set(PRIVATE_KEY_KEY, privateJwk);
    await storage.set(PUBLIC_KEY_KEY, publicJwk);
    return { author: { id: await fingerprint(publicJwk), publicKey: publicJwk }, privateKey: pair.privateKey };
}

export async function signBody(body: CodexBody, privateKey: CryptoKey): Promise<string> {
    const bytes = new TextEncoder().encode(canonicalize(body));
    const signature = await subtle().sign(SIGN_PARAMS, privateKey, bytes);
    return base64UrlEncode(new Uint8Array(signature));
}

/**
 * Verifies a document against the public key it carries. Resolves `false`
 * — never throws — for a bad signature, an unusable key, or a body that
 * fails to serialize: an untrusted file must not be able to raise an
 * exception in the import path.
 */
export async function verifyDocument(document: CodexDocument): Promise<boolean> {
    try {
        const publicKey = await subtle().importKey('jwk', document.body.author.publicKey, ALGORITHM, true, ['verify']);
        const bytes = new TextEncoder().encode(canonicalize(document.body));
        return await subtle().verify(SIGN_PARAMS, publicKey, base64UrlDecode(document.signature), bytes);
    } catch {
        return false;
    }
}

/** Base64url (RFC 4648 §5) — URL- and filename-safe, so a Codex can also travel in a `#/connect`-style fragment later. */
function base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns an `ArrayBuffer` rather than a view: WebCrypto's `BufferSource` parameters reject a `Uint8Array` whose backing buffer TypeScript cannot prove is a plain `ArrayBuffer` (it could be shared). */
function base64UrlDecode(text: string): ArrayBuffer {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}
