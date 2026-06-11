import { execSync } from "child_process";
import path from "path";

try {
    const cmd = "which g++ || which clang++ || which gcc || which tcc || echo 'no compiler'";
    const output = execSync(cmd).toString().trim();
    console.log("Compiler search result:", output);
    
    // Also list system paths or packages if relevant
    const pathOutput = execSync("echo $PATH").toString().trim();
    console.log("PATH:", pathOutput);
} catch (err: any) {
    console.error("Diagnostic failed:", err.message);
}
