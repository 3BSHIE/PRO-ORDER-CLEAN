/* Surface card. Set interactive for hover lift + gold border. */
export default function Card({
  interactive = false,
  className = "",
  children,
  ...rest
}) {
  return (
    <div
      className={`card ${interactive ? "card--interactive" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
