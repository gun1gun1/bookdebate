import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error("사용법: npm run hash-password -- <평문 비밀번호>");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log(hash);
