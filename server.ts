import express from 'express';
import cors from 'cors';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const app = express();
app.use(cors());
app.use(express.json());

let dbInstance: any;

async function initDB() {
  const db = await open({
    filename: './inventory.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      price TEXT,
      expressPrice TEXT,
      status TEXT,
      location TEXT,
      stockCount INTEGER,
      image TEXT
    );
  `);

  const count = await db.get('SELECT COUNT(*) as count FROM products');
  if (count.count === 0) {
    await db.run(`
      INSERT INTO products (name, price, expressPrice, status, location, stockCount, image) VALUES 
      ('phone', '$699.99', '$649.00', 'In Stock', 'Aisle 5 - Mobile Hub', 10, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400'),
      ('watch', '$65.99', '$59.99', 'In Stock', 'Aisle 4 - Tech Counter', 15, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'),
      ('shoes', '$89.99', '$82.50', 'In Stock', 'Aisle 2 - Footwear Zone', 8, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400'),
      ('shirt', '$39.99', '$34.99', 'Low Stock', 'Aisle 1 - Menswear', 3, 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400'),
      ('jacket', '$119.99', '$105.00', 'In Stock', 'Aisle 3 - Outerwear', 5, 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400'),
      ('keyboard', '$49.99', '$42.99', 'In Stock', 'Aisle 4 - Peripherals', 12, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400'),
      ('laptop', '$999.99', '$929.00', 'In Stock', 'Aisle 5 - PC Station', 6, 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400'),
      ('headphones', '$129.99', '$115.00', 'In Stock', 'Aisle 4 - Audio Zone', 14, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400')
    `);
  }
  return db;
}

function createMCPServer() {
  const server = new Server(
    { name: "alexa-agentic-mcp", version: "14.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "check_store_inventory",
        description: "Query SQLite database for product stock",
        inputSchema: {
          type: "object",
          properties: { productName: { type: "string" } },
          required: ["productName"]
        }
      },
      {
        name: "negotiate_discount",
        description: "AI dynamic discount negotiator tool",
        inputSchema: {
          type: "object",
          properties: { productName: { type: "string" } },
          required: ["productName"]
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "check_store_inventory") {
      const searchItem = String((args as any)?.productName || "").toLowerCase().trim();
      const product = await dbInstance.get('SELECT * FROM products WHERE LOWER(name) LIKE ?', [`%${searchItem}%`]);
      return { content: [{ type: "text", text: JSON.stringify(product || null) }] };
    }

    if (name === "negotiate_discount") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            discountApplied: "15%",
            promoCode: "ALEXA15OFF",
            dealStatus: "Approved by AI Pricing Engine"
          })
        }]
      };
    }

    throw new Error("Tool not found");
  });

  return server;
}

let transport: SSEServerTransport;

app.get("/mcp/sse", async (req, res) => {
  const server = createMCPServer();
  transport = new SSEServerTransport("/mcp/messages", res);
  await server.connect(transport);
});

app.post("/mcp/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("Session not initialized");
  }
});

initDB().then(db => {
  dbInstance = db;
  console.log("📂 Clean Agentic MCP Hub Server Connected!");
  app.listen(8080, () => {
    console.log("🚀 Server running on http://localhost:8080");
  });
});