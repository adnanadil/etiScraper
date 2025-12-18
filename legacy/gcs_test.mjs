import { Storage } from "@google-cloud/storage";
import fs from "fs";

const BUCKET_NAME = "etimad-tenders-data"; // replace this
const LOCAL_FILE = "test-local.txt";
const GCS_FILE = "test-gcs.txt";

async function testGCS() {
  const storage = new Storage();

  // 1️⃣ Create a local file
  fs.writeFileSync(LOCAL_FILE, "Hello from local machine replace 👋");

  // 2️⃣ Upload to GCS
  await storage.bucket(BUCKET_NAME).upload(LOCAL_FILE, {
    destination: GCS_FILE,
  });

  console.log("✅ Uploaded to GCS");

  // 3️⃣ Download back from GCS
  await storage
    .bucket(BUCKET_NAME)
    .file(GCS_FILE)
    .download({ destination: "downloaded.txt" });

  console.log("✅ Downloaded from GCS");

  // 4️⃣ Read downloaded file
  const content = fs.readFileSync("downloaded.txt", "utf-8");
  console.log("📄 File content:", content);
}

testGCS().catch(console.error);