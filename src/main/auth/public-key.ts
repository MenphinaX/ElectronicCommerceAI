// 应用内置 RSA 公钥（与 tools/license-tool/keys/admin-private.pem 配对；私钥绝不进入安装包）
// 指纹见 LICENSE_PUBLIC_KEY_FINGERPRINT，测试断言与授权工具公钥文件一致
import { publicKeyFingerprint } from './license-core.mjs'

export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoQHvd/ltDrc4SIy5d/7c
G+LgFTjpT4SqwWXEyS3gNtmK2tmUedKImGyr+A97Sswph2VZSJe0KB8mYhSU3Y52
xHipyzqEcOq+Vi06yURBOxNVtbxpkdz7Yo4+rEQqJNwUyBvm84Vu27yH6ZgtG1cA
ywSEklq46dwq1s75HwZ1yl/iTe933+bTgEVLjtrcJ27geHWIdFjJ8quR4k2qbsXa
Q8CY4tuQO899TkDFZn2miMP4f2OFKXGo1pQdgQ+tgfGEEpK6IeJLbwFKdtd08gpn
Er1BfdE+24Bm+Rg9rHaXV4wv+PVJsW3S36r/LgSjc6O5ROWG3ycEYZIEdNNMC/hf
eQIDAQAB
-----END PUBLIC KEY-----`.trim()

export const LICENSE_PUBLIC_KEY_FINGERPRINT = publicKeyFingerprint(LICENSE_PUBLIC_KEY_PEM)