import { Subsecciones } from "./subsecciones";

export default function LayoutAsistente({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <Subsecciones />
      {children}
    </div>
  );
}
