const bcrypt = require("bcryptjs");

async function main() {
  const plain = process.argv[2];
  if (!plain) {
    console.error("Usage: npm run hash:password -- <plain_password>");
    process.exit(1);
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const hash = await bcrypt.hash(plain, rounds);
  console.log(hash);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
