import { useState } from "react";

const etfs = [
  {
    ticker: "SPY",
    name: "SPDR S&P 500 ETF",
    what: "The 500 biggest U.S. companies",
    analogy: "The \"starter pack\" of investing — owns a slice of Apple, Microsoft, Amazon, and ~500 more top U.S. companies.",
    index: "S&P 500",
    focus: "🇺🇸 U.S. Large-Cap Blend",
    expenseRatio: 0.09,
    dividendYield: 1.07,
    return1Y: 23.3,
    return5Y: 15.8,
    return10Y: 13.1,
    volatility: 2.41,
    maxDrawdown: -55.19,
    pe: 28.86,
    holdings: 503,
    aum: "$714B",
    topSectors: "Tech 34%, Healthcare 12%, Financials 14%",
    riskLevel: 3,
    color: "#2563eb",
  },
  {
    ticker: "VEA",
    name: "Vanguard FTSE Developed Markets ETF",
    what: "Big companies outside the U.S. (Europe, Japan, etc.)",
    analogy: "Like SPY, but for the rest of the rich world — Toyota, Nestlé, Samsung, etc.",
    index: "FTSE Developed All Cap ex US",
    focus: "🌍 International Developed",
    expenseRatio: 0.03,
    dividendYield: 2.93,
    return1Y: 38.74,
    return5Y: 8.5,
    return10Y: 5.0,
    volatility: 2.6,
    maxDrawdown: -57.0,
    pe: 16.5,
    holdings: 3900,
    aum: "$140B+",
    topSectors: "Financials 20%, Industrials 16%, Tech 12%",
    riskLevel: 3,
    color: "#059669",
  },
  {
    ticker: "EEM",
    name: "iShares MSCI Emerging Markets ETF",
    what: "Companies in developing countries (China, India, Brazil, etc.)",
    analogy: "The \"high-risk, high-reward\" international bet — investing in countries that are still growing fast.",
    index: "MSCI Emerging Markets",
    focus: "🌏 Emerging Markets",
    expenseRatio: 0.68,
    dividendYield: 2.36,
    return1Y: 33.98,
    return5Y: 3.73,
    return10Y: 9.19,
    volatility: 3.2,
    maxDrawdown: -65.0,
    pe: 13.7,
    holdings: 1200,
    aum: "$26B",
    topSectors: "Tech 24%, Financials 22%, Consumer 14%",
    riskLevel: 4,
    color: "#dc2626",
  },
  {
    ticker: "IWV",
    name: "iShares Russell 3000 ETF",
    what: "Nearly ALL U.S. stocks — big, medium, and small",
    analogy: "SPY's bigger sibling — same big companies PLUS thousands of smaller ones for broader coverage.",
    index: "Russell 3000",
    focus: "🇺🇸 U.S. Total Market",
    expenseRatio: 0.20,
    dividendYield: 0.97,
    return1Y: 14.76,
    return5Y: 15.3,
    return10Y: 13.9,
    volatility: 2.81,
    maxDrawdown: -55.61,
    pe: 27.5,
    holdings: 2900,
    aum: "$16B",
    topSectors: "Tech 32%, Healthcare 12%, Financials 13%",
    riskLevel: 3,
    color: "#7c3aed",
  },
  {
    ticker: "IWD",
    name: "iShares Russell 1000 Value ETF",
    what: "Big U.S. \"bargain\" stocks that pay good dividends",
    analogy: "The \"boring but steady\" pick — banks, utilities, old-school companies that are underpriced but reliable.",
    index: "Russell 1000 Value",
    focus: "🇺🇸 U.S. Large-Cap Value",
    expenseRatio: 0.19,
    dividendYield: 1.61,
    return1Y: 16.85,
    return5Y: 11.9,
    return10Y: 10.2,
    volatility: 2.66,
    maxDrawdown: -60.10,
    pe: 18.0,
    holdings: 850,
    aum: "$60B",
    topSectors: "Financials 22%, Healthcare 16%, Industrials 12%",
    riskLevel: 2,
    color: "#ca8a04",
  },
  {
    ticker: "IWF",
    name: "iShares Russell 1000 Growth ETF",
    what: "Fast-growing U.S. tech & innovation companies",
    analogy: "The \"Silicon Valley\" ETF — heavy on Apple, Nvidia, Amazon, Meta. High growth, but wild swings.",
    index: "Russell 1000 Growth",
    focus: "🇺🇸 U.S. Large-Cap Growth",
    expenseRatio: 0.19,
    dividendYield: 0.35,
    return1Y: 18.33,
    return5Y: 14.6,
    return10Y: 18.2,
    volatility: 4.41,
    maxDrawdown: -64.25,
    pe: 38.0,
    holdings: 430,
    aum: "$95B",
    topSectors: "Tech 48%, Consumer 15%, Healthcare 10%",
    riskLevel: 4,
    color: "#e11d48",
  },
];

const glossary = {
  "Expense Ratio": "The annual fee you pay to own the ETF. Think of it like a subscription fee — 0.09% means you pay 90¢ per year for every $1,000 invested. Lower = better.",
  "Dividend Yield": "How much cash the ETF pays you just for holding it, as a % of its price. Like earning interest on a savings account, but from company profits.",
  "1-Year Return": "How much the ETF grew (or shrank) in the last 12 months. Past performance doesn't guarantee future results, but it shows recent momentum.",
  "5-Year Avg Return": "The average yearly growth over 5 years. Smooths out the good and bad years to show the trend.",
  "10-Year Avg Return": "Same idea but over 10 years — gives you the longest and most reliable view of how the ETF tends to perform.",
  "Volatility": "How wildly the price swings up and down. Higher volatility = more of a rollercoaster. Measured as a %. Think of it as the \"stomach test.\"",
  "Max Drawdown": "The WORST crash from peak to bottom in the fund's history. Shows you the absolute worst-case scenario you could have lived through.",
  "P/E Ratio": "Price-to-Earnings ratio. How \"expensive\" the stocks in the ETF are. Lower P/E = cheaper/undervalued. Higher P/E = investors expect big growth.",
};

function RiskDots({ level }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: i <= level
              ? level <= 2 ? "#22c55e" : level <= 3 ? "#eab308" : "#ef4444"
              : "#1e293b",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        />
      ))}
      <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4 }}>
        {level <= 2 ? "Lower" : level <= 3 ? "Medium" : "Higher"}
      </span>
    </div>
  );
}

function Bar({ value, max, color, label, suffix = "%" }) {
  const pct = Math.max(0, (value / max) * 100);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
        <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>
          {value}{suffix}
        </span>
      </div>
      <div style={{ background: "#1e293b", borderRadius: 6, height: 8, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            borderRadius: 6,
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}

function ETFCard({ etf, isExpanded, onToggle }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        border: `1px solid ${etf.color}33`,
        borderRadius: 16,
        padding: 24,
        cursor: "pointer",
        transition: "all 0.3s ease",
        boxShadow: isExpanded ? `0 0 30px ${etf.color}22` : "0 2px 8px rgba(0,0,0,0.3)",
      }}
      onClick={onToggle}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{
              fontSize: 28,
              fontWeight: 800,
              color: etf.color,
              letterSpacing: "-0.02em",
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {etf.ticker}
            </span>
            <span style={{
              fontSize: 11,
              padding: "3px 10px",
              background: `${etf.color}22`,
              color: etf.color,
              borderRadius: 20,
              fontWeight: 600,
            }}>
              {etf.focus}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 400 }}>{etf.name}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Expense Ratio</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: etf.expenseRatio <= 0.1 ? "#22c55e" : etf.expenseRatio <= 0.2 ? "#eab308" : "#ef4444" }}>
            {etf.expenseRatio}%
          </div>
        </div>
      </div>

      <div style={{
        background: "#0f172a",
        borderRadius: 10,
        padding: 14,
        marginBottom: 16,
        borderLeft: `3px solid ${etf.color}`,
      }}>
        <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.5 }}>
          <strong style={{ color: "#f1f5f9" }}>What is it?</strong> {etf.analogy}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>1Y Return</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: etf.return1Y >= 0 ? "#22c55e" : "#ef4444" }}>
            {etf.return1Y > 0 ? "+" : ""}{etf.return1Y}%
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Dividend</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#38bdf8" }}>
            {etf.dividendYield}%
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Risk</div>
          <RiskDots level={etf.riskLevel} />
        </div>
      </div>

      {isExpanded && (
        <div style={{ borderTop: "1px solid #334155", paddingTop: 16, animation: "fadeIn 0.3s ease" }}>
          <Bar value={etf.return5Y} max={20} color={etf.color} label="5Y Avg Annual Return" />
          <Bar value={etf.return10Y} max={20} color={etf.color} label="10Y Avg Annual Return" />
          <Bar value={etf.volatility} max={5} color="#f59e0b" label="Volatility (lower = calmer)" />
          <Bar value={Math.abs(etf.maxDrawdown)} max={70} color="#ef4444" label="Worst Crash Ever" suffix="% drop" />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
            <div style={{ background: "#0f172a", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>P/E Ratio</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>{etf.pe}x</div>
            </div>
            <div style={{ background: "#0f172a", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>Holdings</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>{etf.holdings.toLocaleString()}</div>
            </div>
            <div style={{ background: "#0f172a", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>Total Assets</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>{etf.aum}</div>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>
            <strong style={{ color: "#cbd5e1" }}>Top Sectors:</strong> {etf.topSectors}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
            <strong style={{ color: "#cbd5e1" }}>Tracks:</strong> {etf.index}
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#475569" }}>
        {isExpanded ? "▲ Click to collapse" : "▼ Click for more details"}
      </div>
    </div>
  );
}

export default function ETFComparison() {
  const [expandedCards, setExpandedCards] = useState({});
  const [showGlossary, setShowGlossary] = useState(false);
  const [sortBy, setSortBy] = useState("default");

  const toggleCard = (ticker) => {
    setExpandedCards((prev) => ({ ...prev, [ticker]: !prev[ticker] }));
  };

  const sorted = [...etfs].sort((a, b) => {
    if (sortBy === "return") return b.return1Y - a.return1Y;
    if (sortBy === "dividend") return b.dividendYield - a.dividendYield;
    if (sortBy === "cheap") return a.expenseRatio - b.expenseRatio;
    if (sortBy === "safe") return a.volatility - b.volatility;
    return 0;
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#020617",
      color: "#f1f5f9",
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: "32px 16px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{
            fontSize: 36,
            fontWeight: 800,
            marginBottom: 8,
            background: "linear-gradient(135deg, #38bdf8, #818cf8, #e879f9)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.03em",
          }}>
            ETF Comparison Guide
          </h1>
          <p style={{ fontSize: 15, color: "#94a3b8", maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>
            A beginner-friendly breakdown of 6 popular ETFs. Click any card for more details. All data is approximate and based on recent figures — always verify before investing.
          </p>
        </div>

        {/* Quick Concepts */}
        <div style={{
          background: "linear-gradient(135deg, #0f172a, #1a1a2e)",
          border: "1px solid #334155",
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#38bdf8" }}>
            💡 What's an ETF? (30-second explainer)
          </h3>
          <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.7, margin: 0 }}>
            An <strong>ETF (Exchange-Traded Fund)</strong> is like a basket that holds a bunch of stocks. Instead of buying Apple, Google, and Amazon one by one, you buy one ETF that owns all of them (and hundreds more). It trades on the stock market just like a regular stock. ETFs are popular because they're <strong>cheap</strong> (low fees), <strong>diversified</strong> (you own many companies at once, which reduces risk), and <strong>easy to buy</strong> (just one ticker symbol).
          </p>
        </div>

        {/* Sort Controls */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748b", marginRight: 4 }}>Sort by:</span>
          {[
            { key: "default", label: "Default" },
            { key: "return", label: "📈 Best 1Y Return" },
            { key: "dividend", label: "💰 Highest Dividend" },
            { key: "cheap", label: "💸 Cheapest Fees" },
            { key: "safe", label: "🛡️ Least Volatile" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: sortBy === s.key ? "1px solid #38bdf8" : "1px solid #334155",
                background: sortBy === s.key ? "#38bdf822" : "transparent",
                color: sortBy === s.key ? "#38bdf8" : "#94a3b8",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ETF Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
          {sorted.map((etf) => (
            <ETFCard
              key={etf.ticker}
              etf={etf}
              isExpanded={!!expandedCards[etf.ticker]}
              onToggle={() => toggleCard(etf.ticker)}
            />
          ))}
        </div>

        {/* Quick Comparison Table */}
        <div style={{
          background: "#0f172a",
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
          overflowX: "auto",
          border: "1px solid #1e293b",
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#e2e8f0" }}>
            📊 Side-by-Side Comparison
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #334155" }}>
                {["ETF", "Fee", "Div %", "1Y", "5Y", "10Y", "Vol.", "P/E"].map((h) => (
                  <th key={h} style={{ padding: "8px 6px", textAlign: "right", color: "#64748b", fontWeight: 600, fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {etfs.map((e) => (
                <tr key={e.ticker} style={{ borderBottom: "1px solid #1e293b" }}>
                  <td style={{ padding: "10px 6px", fontWeight: 700, color: e.color, textAlign: "right" }}>{e.ticker}</td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: e.expenseRatio <= 0.1 ? "#22c55e" : e.expenseRatio <= 0.2 ? "#eab308" : "#ef4444" }}>{e.expenseRatio}%</td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: "#38bdf8" }}>{e.dividendYield}%</td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: e.return1Y >= 0 ? "#22c55e" : "#ef4444" }}>{e.return1Y > 0 ? "+" : ""}{e.return1Y}%</td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: "#cbd5e1" }}>{e.return5Y}%</td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: "#cbd5e1" }}>{e.return10Y}%</td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: e.volatility >= 4 ? "#ef4444" : e.volatility >= 3 ? "#eab308" : "#94a3b8" }}>{e.volatility}%</td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: "#94a3b8" }}>{e.pe}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Key Takeaways */}
        <div style={{
          background: "linear-gradient(135deg, #1a1a2e, #0f172a)",
          border: "1px solid #334155",
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "#e2e8f0" }}>
            🎯 Key Takeaways for a Beginner
          </h3>
          <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }}>
            <p style={{ margin: "0 0 12px 0" }}>
              <strong style={{ color: "#2563eb" }}>SPY</strong> is the most popular starting point for most investors. It gives you a broad piece of the biggest U.S. companies at a very low cost. If you only buy one thing, many people start here.
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              <strong style={{ color: "#7c3aed" }}>IWV</strong> is very similar to SPY but adds thousands of smaller companies. It's like SPY with extra coverage, though it performs almost identically.
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              <strong style={{ color: "#e11d48" }}>IWF</strong> (Growth) vs <strong style={{ color: "#ca8a04" }}>IWD</strong> (Value) is the classic "growth vs value" split. IWF has crushed it over the last decade thanks to tech, but it swings harder. IWD is steadier and pays more dividends, but grows slower. Think of it like a sports car vs a pickup truck.
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              <strong style={{ color: "#059669" }}>VEA</strong> gives you international diversification — if the U.S. market stumbles, having international exposure can cushion the blow. It also pays the highest dividend yield of the group. 2025 was a monster year for international stocks.
            </p>
            <p style={{ margin: "0 0 0 0" }}>
              <strong style={{ color: "#dc2626" }}>EEM</strong> is the highest-risk, highest-potential pick. Emerging markets can have incredible years (like 2025's ~34% return), but also brutal ones (2022's -20%). The fee is also the highest at 0.68%. Consider <strong>VWO</strong> as a cheaper alternative if you want emerging market exposure.
            </p>
          </div>
        </div>

        {/* Glossary Toggle */}
        <div style={{
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
        }}>
          <button
            onClick={() => setShowGlossary(!showGlossary)}
            style={{
              width: "100%",
              background: "none",
              border: "none",
              color: "#38bdf8",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 0,
            }}
          >
            📖 Glossary — What Do These Terms Mean?
            <span style={{ fontSize: 12 }}>{showGlossary ? "▲ Hide" : "▼ Show"}</span>
          </button>
          {showGlossary && (
            <div style={{ marginTop: 16 }}>
              {Object.entries(glossary).map(([term, def]) => (
                <div key={term} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 3 }}>{term}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{def}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div style={{
          textAlign: "center",
          fontSize: 11,
          color: "#475569",
          lineHeight: 1.6,
          padding: "0 16px",
        }}>
          ⚠️ This is for educational purposes only, not financial advice. Past performance does not guarantee future results. Data is approximate and sourced from public financial databases as of early 2026. Always do your own research or consult a financial advisor before investing.
        </div>
      </div>
    </div>
  );
}
