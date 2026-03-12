import { defineBuildConfig } from "obuild/config";

export default defineBuildConfig({
  declaration: true,
  rollup: {
    emitCJS: false,
  },
  entries: [
    {
      type: "bundle",
      input: [
        "./src/index.ts",
        "./src/cli.ts",
        "./src/ai.ts",
        "./src/opencode.ts",
        "./src/claude-code.ts",
        "./src/claude-code-hooks.ts",
      ],
    },
  ],
});
