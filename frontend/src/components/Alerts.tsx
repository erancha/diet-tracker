export interface AlertItem {
  kind: "alert" | "ok";
  message: string;
}

export function Alerts({ items }: { items: AlertItem[] }) {
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className={item.kind}>{item.message}</div>
      ))}
    </div>
  );
}
