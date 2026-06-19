import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { CircuitSimulator } from "./src/solver_ts";

async function startServer() {
    const app = express();
    const PORT = 3000;

    app.use(express.json({ limit: "50mb" }));

    console.log("Setting up high-performance in-memory Circuit Simulation Engine...");

    // API route to trigger the simulation high-speed run
    app.post("/api/simulate", (req, res) => {
        try {
            const netlist = req.body;
            if (!netlist) {
                return res.status(400).json({ error: "Missing netlist configuration" });
            }

            console.log(`Starting transient simulation (Solver: ${netlist.simulation_parameters?.solver || "euler"}, Step: ${netlist.simulation_parameters?.step_type || "fixed"})...`);
            
            const sim = new CircuitSimulator(
                netlist.physical_stage || [],
                netlist.control_loops || [],
                netlist.simulation_parameters || {}
            );

            const solution = sim.run();
            console.log("Simulation solved successfully! Records count:", solution.time.length);
            return res.json(solution);

        } catch (e: any) {
            console.error("API simulation error:", e);
            res.status(500).json({ error: "Internal server simulation error", message: e.message });
        }
    });

    // Vite Middleware for integrated SPA in development
    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), "dist");
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
            res.sendFile(path.join(distPath, "index.html"));
        });
    }

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`C++ Circuit CAD App Server started at: http://localhost:${PORT}`);
    });
}

startServer();
