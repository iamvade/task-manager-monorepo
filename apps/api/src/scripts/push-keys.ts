import webpush from 'web-push';

// Prints a new VAPID key pair for Web Push. Put both in the API's environment (.env) with
// VAPID_SUBJECT. Changing the pair later makes every browser subscribe again (old subscriptions
// stop working), so generate it once per server.
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
process.stdout.write(`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`);
