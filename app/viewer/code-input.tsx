"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";

import { CASE_CODE_GROUP, formatCodeInput } from "@/lib/case-code";

type CodeInputProps = {
  id: string;
  name: string;
  maxLength: number;
  placeholder: string;
  style: CSSProperties;
};

function caretForCleanChars(cleanCharsBefore: number): number {
  if (cleanCharsBefore <= CASE_CODE_GROUP) return cleanCharsBefore;
  return cleanCharsBefore + 1;
}

export function CodeInput({
  id,
  name,
  maxLength,
  placeholder,
  style,
}: CodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef(0);
  const [value, setValue] = useState("");

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const caret = input.selectionStart ?? input.value.length;
    const cleanCharsBefore = input.value
      .slice(0, caret)
      .replace(/[^A-Z0-9]/gi, "").length;
    const formatted = formatCodeInput(input.value);
    caretRef.current = Math.min(
      caretForCleanChars(cleanCharsBefore),
      formatted.length,
    );
    setValue(formatted);
  }

  useEffect(() => {
    inputRef.current?.setSelectionRange(caretRef.current, caretRef.current);
  }, [value]);

  return (
    <input
      ref={inputRef}
      id={id}
      name={name}
      value={value}
      onChange={handleChange}
      required
      maxLength={maxLength}
      placeholder={placeholder}
      style={style}
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
    />
  );
}