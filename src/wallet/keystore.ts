import { randomBytes } from "node:crypto";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { scrypt } from "@noble/hashes/scrypt";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { err, ok, type Result } from "../lib/result.js";
import { keystoreFileSchema, type KeystoreFile, type WalletError } from "./types.js";

const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1, dkLen: 32 };
const SALT_BYTES = 16;
const NONCE_BYTES = 24;

function deriveKey(passphrase: string, salt: Uint8Array): Uint8Array {
  return scrypt(utf8ToBytes(passphrase), salt, SCRYPT_PARAMS);
}

export function encryptPrivateKey(
  privateKeyHex: string,
  passphrase: string,
  address: string,
): KeystoreFile {
  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const key = deriveKey(passphrase, salt);
  const cipher = xchacha20poly1305(key, nonce);
  const plaintext = utf8ToBytes(privateKeyHex.replace(/^0x/, ""));
  const ciphertext = cipher.encrypt(plaintext);

  return {
    version: 1,
    address,
    salt: bytesToHex(salt),
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
  };
}

export function decryptPrivateKey(
  keystore: KeystoreFile,
  passphrase: string,
): Result<string, WalletError> {
  const parsed = keystoreFileSchema.safeParse(keystore);
  if (!parsed.success) {
    return err({ code: "KEYSTORE_INVALID", message: parsed.error.message });
  }

  try {
    const salt = hexToBytes(parsed.data.salt);
    const nonce = hexToBytes(parsed.data.nonce);
    const ciphertext = hexToBytes(parsed.data.ciphertext);
    const key = deriveKey(passphrase, salt);
    const cipher = xchacha20poly1305(key, nonce);
    const plaintext = cipher.decrypt(ciphertext);
    const hex = new TextDecoder().decode(plaintext);
    return ok(`0x${hex}`);
  } catch {
    return err({ code: "DECRYPT_FAILED", message: "invalid passphrase or corrupted keystore" });
  }
}

/** Best-effort scrub of a hex private key string from local scope. */
export function scrubHexKey(key: { value: string }): void {
  key.value = "0".repeat(key.value.length);
}
