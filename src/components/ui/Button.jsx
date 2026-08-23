/* Base button.
   variant: primary | outline | ghost | danger
   size:    sm | md | lg
   Defaults to type="button" so buttons never submit forms by accident;
   pass type="submit" explicitly where needed. */
export default function Button({
  variant = "primary",
  size = "md",
  full = false,
  icon: Icon,
  type = "button",
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size} ${full ? "btn--full" : ""}`}
      {...rest}
    >
      {Icon && <Icon size={size === "sm" ? 14 : 16} strokeWidth={2.2} />}
      {children}
    </button>
  );
}
