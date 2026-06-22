import { PackagingOrchestrator } from "./packaging/PackagingOrchestrator.mjs";

try {
  await PackagingOrchestrator.instance.run(process.argv.slice(2));
} catch (error) {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
}
