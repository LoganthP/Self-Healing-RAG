# Information Security Handbook

## 1. Encryption Standards

Symmetric encryption uses a single shared secret key for both encryption and decryption. It is fast and suited to bulk data. Asymmetric encryption uses a key pair: a public key that anyone may use to encrypt, and a private key that only the owner holds to decrypt or sign.

Data at rest must be encrypted with AES-256 in GCM mode. DES and 3DES are no longer allowed because their short key and block sizes make them vulnerable to brute-force and birthday attacks.

RSA keys must be at least 3072 bits. New services should prefer elliptic-curve keys (Ed25519 or P-256) for better performance at equivalent strength.

TLS combines both approaches: the handshake uses public-key cryptography to authenticate the server and agree on a session key, and the session data is then protected with fast shared-key encryption.

## 2. Passwords and Authentication

Passwords must be stored using a slow, salted hash such as Argon2id or bcrypt. Plain-text storage and fast hashes like MD5 or SHA-1 are prohibited.

Multi-factor authentication is mandatory for all staff. Hardware security keys are preferred for MFA because they resist phishing: the key checks the website origin before it signs the login challenge.

## 3. Network Security

Perimeter firewalls follow a default-deny policy. Only traffic that is explicitly allowed by an approved rule may pass, and every rule needs an owner and a review date.

## 4. Incident Response

The incident response process has five phases: preparation, detection and analysis, containment, eradication and recovery, and post-incident review. Severity-1 incidents must be reported to the security lead within 30 minutes.
