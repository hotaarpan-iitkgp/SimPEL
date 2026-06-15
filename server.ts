import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { CircuitSimulator } from "./src/solver_ts";

const activeSimulations = new Map<string, { paused: boolean; cancelled: boolean }>();

async function startServer() {
    const app = express();
    const PORT = 3000;

    app.use(express.json({ limit: "50mb" }));

    console.log("Setting up high-performance in-memory Circuit Simulation Engine...");

    // API route to trigger the simulation high-speed run
    app.post("/api/simulate", async (req, res) => {
        const netlist = req.body;
        if (!netlist) {
            return res.status(400).json({ error: "Missing netlist configuration" });
        }

        const sessionId = netlist.sessionId || "default_session";

        // Cancel any active simulations first to prevent runaway loops
        for (const [id, state] of activeSimulations.entries()) {
            console.log(`Cancelling previous active simulation session: ${id}`);
            state.cancelled = true;
        }

        console.log(`Starting transient simulation (Session: ${sessionId}, Solver: ${netlist.simulation_parameters?.solver || "euler"}, Step: ${netlist.simulation_parameters?.step_type || "fixed"})...`);
        
        try {
            const sim = new CircuitSimulator(
                netlist.physical_stage || [],
                netlist.control_loops || [],
                netlist.simulation_parameters || {}
            );

            activeSimulations.set(sessionId, { paused: false, cancelled: false });

            const solution = await sim.runAsync(
                () => activeSimulations.get(sessionId)?.cancelled || false,
                () => activeSimulations.get(sessionId)?.paused || false
            );

            console.log(`Simulation finished/terminated (Session: ${sessionId}). Records count:`, solution.time.length);
            return res.json(solution);

        } catch (e: any) {
            console.error("API simulation error:", e);
            res.status(500).json({ error: "Internal server simulation error", message: e.message });
        } finally {
            activeSimulations.delete(sessionId);
        }
    });

    app.post("/api/pause", (req, res) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: "Missing sessionId" });
        }
        const state = activeSimulations.get(sessionId);
        if (state) {
            state.paused = !state.paused;
            console.log(`Simulation session ${sessionId} paused: ${state.paused}`);
            return res.json({ paused: state.paused });
        }
        res.status(404).json({ error: "Simulation session not found" });
    });

    app.post("/api/cancel", (req, res) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: "Missing sessionId" });
        }
        const state = activeSimulations.get(sessionId);
        if (state) {
            state.cancelled = true;
            console.log(`Simulation session ${sessionId} cancelled.`);
            return res.json({ cancelled: true });
        }
        res.status(404).json({ error: "Simulation session not found" });
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
