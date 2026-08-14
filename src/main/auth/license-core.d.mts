export interface LicensePayload {
  ver: number
  type: 'machine' | 'unlock'
  machine: string
  expires: string
  issuer: string
  issuedAt: string
  purpose: string
}
export declare const LICENSE_VERSION: 1
export declare const MACHINE_CODE_PREFIX: string
export declare function sha256Hex(input: string): string
export declare function canonicalLicense(p: LicensePayload): string
export declare function signLicensePayload(privateKeyPem: string, payload: LicensePayload): string
export declare function verifyLicenseSignature(publicKeyPem: string, payload: LicensePayload, signature: string): boolean
export declare function generateKeyPair(): { publicKey: string; privateKey: string }
export declare function publicKeyFingerprint(pem: string): string
export declare function parseMachineCode(input: string): { hard: string; full: string } | null