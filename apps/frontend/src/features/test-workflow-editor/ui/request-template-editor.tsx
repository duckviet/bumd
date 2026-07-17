"use client";

import { useState, useEffect } from "react";
import type {
  TestEnvironmentDto,
  JsonValue,
  TestWorkflowNode,
  TestWorkflowRequestTemplate,
} from "@/entities/test-workflow";
import { WorkflowVariablePicker } from "@/features/test-workflow-editor/ui/workflow-variable-picker";
import {
  KeyValueEditor,
  BodyEditor,
  type ConsoleField,
  type MultipartField,
  buildMultipartBody,
  parseMultipartBody,
} from "@/entities/api-console";

type RequestTemplateEditorProps = {
  readonly node: TestWorkflowNode;
  readonly environment: TestEnvironmentDto | null;
  readonly testData: Readonly<Record<string, JsonValue>>;
  readonly onChange: (template: TestWorkflowRequestTemplate) => void;
};

export function RequestTemplateEditor({ node, environment, testData, onChange }: RequestTemplateEditorProps) {
  const { requestTemplate } = node;

  const [serverUrl, setServerUrl] = useState(requestTemplate.serverUrl ?? "");
  const [headers, setHeaders] = useState<ConsoleField[]>([]);
  const [query, setQuery] = useState<ConsoleField[]>([]);
  const [pathParams, setPathParams] = useState<ConsoleField[]>([]);
  const [bodyType, setBodyType] = useState<"json" | "key-value" | "multipart">("json");
  const [bodyText, setBodyText] = useState("");
  const [keyValueFields, setKeyValueFields] = useState<ConsoleField[]>([]);
  const [multipartFields, setMultipartFields] = useState<MultipartField[]>([]);

  // Convert record to fields
  function recordToFields(rec?: Record<string, unknown>): ConsoleField[] {
    if (!rec) return [];
    return Object.entries(rec).map(([k, v]) => ({
      id: `body-kv-${k}-${Math.random()}`,
      key: k,
      value: String(v),
      enabled: true,
      isCustom: true,
    }));
  }

  // Convert fields to record
  function fieldsToRecord(fields: readonly ConsoleField[]): Record<string, string> {
    const rec: Record<string, string> = {};
    for (const f of fields) {
      if (f.key.trim() !== "") {
        rec[f.key.trim()] = f.value;
      }
    }
    return rec;
  }

  // Populate from template when node changes
  useEffect(() => {
    setServerUrl(requestTemplate.serverUrl ?? "");
    setHeaders(recordToFields(requestTemplate.headers));
    setQuery(recordToFields(requestTemplate.query));
    setPathParams(recordToFields(requestTemplate.pathParams));

    const ctHeader = Object.entries(requestTemplate.headers || {}).find(
      ([k]) => k.toLowerCase() === "content-type"
    )?.[1];
    
    const isMultipart = typeof ctHeader === "string" && ctHeader.toLowerCase().includes("multipart/form-data") && ctHeader.toLowerCase().includes("boundary=");
    
    if (isMultipart && typeof requestTemplate.body === "string") {
      setBodyType("multipart");
      setMultipartFields(parseMultipartBody(requestTemplate.body, ctHeader as string));
      setBodyText("");
      setKeyValueFields([]);
    } else {
      const isObject = typeof requestTemplate.body === "object" && requestTemplate.body !== null;
      if (isObject) {
        setBodyType("key-value");
        setKeyValueFields(recordToFields(requestTemplate.body as Record<string, unknown>));
        setBodyText("");
        setMultipartFields([]);
      } else {
        setBodyType("json");
        setKeyValueFields([]);
        setMultipartFields([]);
        if (requestTemplate.body === undefined || requestTemplate.body === null) {
          setBodyText("");
        } else {
          setBodyText(String(requestTemplate.body));
        }
      }
    }
  }, [node.id]);

  const triggerFieldsChange = (updates: {
    readonly serverUrl?: string;
    readonly headers?: ConsoleField[];
    readonly query?: ConsoleField[];
    readonly pathParams?: ConsoleField[];
    readonly bodyType?: "json" | "key-value" | "multipart";
    readonly bodyText?: string;
    readonly keyValueFields?: ConsoleField[];
    readonly multipartFields?: MultipartField[];
  }) => {
    const nextServerUrl = updates.serverUrl !== undefined ? updates.serverUrl : serverUrl;
    const nextHeaders = updates.headers !== undefined ? updates.headers : headers;
    const nextQuery = updates.query !== undefined ? updates.query : query;
    const nextPathParams = updates.pathParams !== undefined ? updates.pathParams : pathParams;
    const nextBodyType = updates.bodyType !== undefined ? updates.bodyType : bodyType;
    const nextBodyText = updates.bodyText !== undefined ? updates.bodyText : bodyText;
    const nextKeyValueFields = updates.keyValueFields !== undefined ? updates.keyValueFields : keyValueFields;
    const nextMultipartFields = updates.multipartFields !== undefined ? updates.multipartFields : multipartFields;

    let headersRecord = fieldsToRecord(nextHeaders);
    let finalBody: unknown = undefined;

    if (nextBodyType === "multipart") {
      let boundary = "";
      const existingCt = Object.entries(headersRecord).find(([k]) => k.toLowerCase() === "content-type")?.[1];
      if (existingCt) {
        const match = existingCt.match(/boundary=(.+)/i);
        if (match) boundary = match[1]!.trim();
      }
      if (!boundary) {
        boundary = `----BumdBoundary${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
      }
      headersRecord = {
        ...headersRecord,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      };
      finalBody = buildMultipartBody(nextMultipartFields, boundary);
    } else if (nextBodyType === "key-value") {
      if (headersRecord["Content-Type"]?.toLowerCase().includes("multipart/form-data")) {
        delete headersRecord["Content-Type"];
      }
      finalBody = fieldsToRecord(nextKeyValueFields);
    } else {
      if (headersRecord["Content-Type"]?.toLowerCase().includes("multipart/form-data")) {
        delete headersRecord["Content-Type"];
      }
      if (nextBodyText.trim().length > 0) {
        try {
          finalBody = JSON.parse(nextBodyText);
        } catch {
          finalBody = nextBodyText;
        }
      }
    }

    onChange({
      serverUrl: nextServerUrl || undefined,
      headers: headersRecord,
      query: fieldsToRecord(nextQuery),
      pathParams: fieldsToRecord(nextPathParams),
      body: finalBody,
    });
  };

  const renderVariablePickerWrapper = (
    val: string,
    onSelect: (v: string) => void,
    fieldLabel: string,
  ) => (
    <WorkflowVariablePicker
      environment={environment}
      fieldLabel={fieldLabel}
      onSelect={onSelect}
      testData={testData}
      value={val}
    />
  );

  const handleAddHeader = () => {
    const updated = [...headers, { id: `header-${Date.now()}-${Math.random()}`, key: "", value: "", enabled: true, isCustom: true }];
    setHeaders(updated);
    triggerFieldsChange({ headers: updated });
  };

  const handleAddQuery = () => {
    const updated = [...query, { id: `query-${Date.now()}-${Math.random()}`, key: "", value: "", enabled: true, isCustom: true }];
    setQuery(updated);
    triggerFieldsChange({ query: updated });
  };

  const handleAddPathParam = () => {
    const updated = [...pathParams, { id: `path-${Date.now()}-${Math.random()}`, key: "", value: "", enabled: true, isCustom: true }];
    setPathParams(updated);
    triggerFieldsChange({ pathParams: updated });
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Server URL */}
      <div className="flex flex-col gap-1">
        <label className="font-semibold text-carbon">Override Server URL</label>
        <div className="flex gap-1">
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            onBlur={() => triggerFieldsChange({ serverUrl })}
            placeholder="https://api.example.com/v1"
            className="min-w-0 flex-1 rounded border border-chalk bg-white px-2 py-1.5 focus:border-signal-orange focus:outline-none"
          />
          {renderVariablePickerWrapper(serverUrl, (value) => {
            setServerUrl(value);
            triggerFieldsChange({ serverUrl: value });
          }, "server URL")}
        </div>
      </div>

      <KeyValueEditor
        title="Path Parameters"
        fields={pathParams}
        onChange={(updated) => { setPathParams(updated as ConsoleField[]); triggerFieldsChange({ pathParams: updated as ConsoleField[] }); }}
        onAdd={handleAddPathParam}
        hideCheckboxes={true}
        forceEditableKeys={true}
        renderVariablePicker={renderVariablePickerWrapper}
      />

      <KeyValueEditor
        title="Query Parameters"
        fields={query}
        onChange={(updated) => { setQuery(updated as ConsoleField[]); triggerFieldsChange({ query: updated as ConsoleField[] }); }}
        onAdd={handleAddQuery}
        hideCheckboxes={true}
        forceEditableKeys={true}
        renderVariablePicker={renderVariablePickerWrapper}
      />

      <KeyValueEditor
        title="Headers"
        fields={headers}
        onChange={(updated) => { setHeaders(updated as ConsoleField[]); triggerFieldsChange({ headers: updated as ConsoleField[] }); }}
        onAdd={handleAddHeader}
        hideCheckboxes={true}
        forceEditableKeys={true}
        renderVariablePicker={renderVariablePickerWrapper}
      />

      <BodyEditor
        bodyType={bodyType}
        onBodyTypeChange={(type) => { setBodyType(type); triggerFieldsChange({ bodyType: type }); }}
        bodyText={bodyText}
        onBodyTextChange={(text) => { setBodyText(text); triggerFieldsChange({ bodyText: text }); }}
        keyValueFields={keyValueFields}
        onKeyValueFieldsChange={(fields) => { setKeyValueFields(fields as ConsoleField[]); triggerFieldsChange({ keyValueFields: fields as ConsoleField[] }); }}
        multipartFields={multipartFields}
        onMultipartFieldsChange={(fields) => { setMultipartFields(fields as MultipartField[]); triggerFieldsChange({ multipartFields: fields as MultipartField[] }); }}
        renderVariablePicker={renderVariablePickerWrapper}
        hideCheckboxes={true}
      />
    </div>
  );
}
