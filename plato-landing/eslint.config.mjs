import next from "eslint-config-next";
const config = [...next, { ignores: ["out/**", ".next/**"] }];
export default config;
