/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useRef } from "react";

interface GestureContextValue {
  hoveredId: string | null;
  dwellProgress: number;
  register: (id: string, handler: () => void) => () => void;
}

const GestureContext = createContext<GestureContextValue>({
  hoveredId: null,
  dwellProgress: 0,
  register: () => () => {},
});

export const GestureProvider: React.FC<{
  value: GestureContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <GestureContext.Provider value={value}>{children}</GestureContext.Provider>
);

export const useGesture = () => useContext(GestureContext);

/**
 * A control that can be activated three ways — clicked, tapped, or pinch-dwelled
 * by a tracked hand. The `data-gesture-id` attribute is what the tracking loop
 * hit-tests against, so every interactive element stays reachable by hand.
 */
type NativeButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "id" | "onClick" | "type" | "disabled" | "className" | "style" | "title" | "children"
>;

export const GestureButton: React.FC<
  NativeButtonProps & {
    id: string;
    onActivate: () => void;
    disabled?: boolean;
    className?: string;
    activeClassName?: string;
    style?: React.CSSProperties;
    title?: string;
    children: React.ReactNode;
  }
> = ({
  id,
  onActivate,
  disabled = false,
  className = "",
  activeClassName = "scale-[1.03] ring-2 ring-white/70",
  style,
  title,
  children,
  ...native
}) => {
  const { hoveredId, register } = useGesture();
  const handlerRef = useRef(onActivate);
  handlerRef.current = onActivate;

  useEffect(() => {
    if (disabled) return;
    return register(id, () => handlerRef.current());
  }, [id, disabled, register]);

  const isHovered = hoveredId === id && !disabled;

  return (
    <button
      {...native}
      type="button"
      title={title}
      aria-label={native["aria-label"] ?? title}
      disabled={disabled}
      data-gesture-id={disabled ? undefined : id}
      onClick={() => !disabled && onActivate()}
      style={style}
      className={`relative transition-all duration-200 ease-out disabled:cursor-not-allowed ${className} ${
        isHovered ? activeClassName : ""
      }`}
    >
      {children}
    </button>
  );
};
