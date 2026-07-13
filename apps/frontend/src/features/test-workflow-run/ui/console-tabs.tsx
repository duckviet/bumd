import type { TestWorkflowStepRunDto } from "@/entities/test-workflow";

export function ConsoleRequestTab({ step }: { readonly step: TestWorkflowStepRunDto }): React.ReactElement {
  const req = step.request as {
    method: string;
    serverUrl: string;
    path: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: unknown;
  } | null;

  if (!req) return <span className="text-slate italic">No request data recorded.</span>;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="font-semibold text-carbon">URL:</span> {req.method} {req.serverUrl}{req.path}
      </div>
      {Object.keys(req.query).length > 0 && (
        <div>
          <span className="font-semibold text-carbon">Query Parameters:</span>
          <pre className="bg-fog p-2 rounded text-[10px] mt-1">{JSON.stringify(req.query, null, 2)}</pre>
        </div>
      )}
      <div>
        <span className="font-semibold text-carbon">Headers:</span>
        <pre className="bg-fog p-2 rounded text-[10px] mt-1">{JSON.stringify(req.headers, null, 2)}</pre>
      </div>
      {req.body !== undefined && (
        <div>
          <span className="font-semibold text-carbon">Body:</span>
          <pre className="bg-fog p-2 rounded text-[10px] mt-1">
            {typeof req.body === "string" ? req.body : JSON.stringify(req.body, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ConsoleResponseTab({ step }: { readonly step: TestWorkflowStepRunDto }): React.ReactElement {
  const res = step.response as {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  } | null;

  if (!res) return <span className="text-slate italic">No response data recorded.</span>;

  const isTruncated = res.body && typeof res.body === "object" && "truncated" in res.body;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="font-semibold text-carbon">Status:</span> {res.status}
      </div>
      <div>
        <span className="font-semibold text-carbon">Headers:</span>
        <pre className="bg-fog p-2 rounded text-[10px] mt-1">{JSON.stringify(res.headers, null, 2)}</pre>
      </div>
      <div>
        <span className="font-semibold text-carbon">Body:</span>
        {isTruncated ? (
          <div className="bg-amber-50 border border-amber-100 p-2 rounded text-[10px] mt-1 flex flex-col gap-1">
            <span className="text-amber-800 font-semibold">Body truncated (exceeded 64KB)</span>
            <pre className="font-mono mt-1">{(res.body as { preview: string }).preview}...</pre>
          </div>
        ) : (
          <pre className="bg-fog p-2 rounded text-[10px] mt-1">
            {typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

export function ConsoleInputsTab({ step }: { readonly step: TestWorkflowStepRunDto }): React.ReactElement {
  const inputs = step.inputs as { type: "env" | "var"; name?: string; key?: string; value: unknown }[] | null;

  if (!inputs || inputs.length === 0) return <span className="text-slate italic">No input references used in this step.</span>;

  return (
    <div className="flex flex-col gap-1">
      <span className="font-semibold text-carbon mb-2">Variables & Env Vars Substituted:</span>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-chalk text-left font-semibold text-slate text-[10px]">
            <th className="py-1">Reference</th>
            <th className="py-1">Value</th>
          </tr>
        </thead>
        <tbody>
          {inputs.map((inp, idx) => (
            <tr key={idx} className="border-b border-chalk last:border-b-0">
              <td className="py-1.5 font-mono text-[10px]">
                {inp.type === "env" ? `{{env.${inp.key}}}` : `{{vars.${inp.name}}}`}
              </td>
              <td className="py-1.5 font-mono text-[10px] text-graphite break-all">
                {typeof inp.value === "object" ? JSON.stringify(inp.value) : String(inp.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ConsoleExportsTab({ step }: { readonly step: TestWorkflowStepRunDto }): React.ReactElement {
  const exports = step.exports as Record<string, unknown> | null;

  if (!exports || Object.keys(exports).length === 0) return <span className="text-slate italic">No variables exported by this step.</span>;

  return (
    <div className="flex flex-col gap-1">
      <span className="font-semibold text-carbon mb-2">Exported Variables:</span>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-chalk text-left font-semibold text-slate text-[10px]">
            <th className="py-1">Name</th>
            <th className="py-1">Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(exports).map(([k, v]) => (
            <tr key={k} className="border-b border-chalk last:border-b-0">
              <td className="py-1.5 font-mono text-[10px] font-semibold">{k}</td>
              <td className="py-1.5 font-mono text-[10px] text-graphite break-all">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ConsoleAssertionsTab({ step }: { readonly step: TestWorkflowStepRunDto }): React.ReactElement {
  const asserts = step.assertions as {
    id: string;
    type: string;
    passed: boolean;
    expected: unknown;
    actual: unknown;
    error?: string;
  }[] | null;

  if (!asserts || asserts.length === 0) return <span className="text-slate italic">No assertions configured for this step.</span>;

  return (
    <div className="flex flex-col gap-1">
      <span className="font-semibold text-carbon mb-2">Assertions Results:</span>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-chalk text-left font-semibold text-slate text-[10px]">
            <th className="py-1">ID / Type</th>
            <th className="py-1">Actual</th>
            <th className="py-1">Expected</th>
            <th className="py-1">Result</th>
          </tr>
        </thead>
        <tbody>
          {asserts.map((a) => (
            <tr key={a.id} className="border-b border-chalk last:border-b-0">
              <td className="py-1.5 font-mono text-[10px]">
                <div>{a.id}</div>
                <div className="text-[9px] text-slate uppercase">{a.type}</div>
              </td>
              <td className="py-1.5 font-mono text-[10px] text-graphite break-all pr-4">
                {a.error ? <span className="text-red-500">{a.error}</span> : typeof a.actual === "object" ? JSON.stringify(a.actual) : String(a.actual ?? "")}
              </td>
              <td className="py-1.5 font-mono text-[10px] text-graphite break-all">
                {typeof a.expected === "object" ? JSON.stringify(a.expected) : String(a.expected)}
              </td>
              <td className="py-1.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  a.passed ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                  {a.passed ? "Pass" : "Fail"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
