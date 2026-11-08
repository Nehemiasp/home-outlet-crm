import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEPARTAMENTOS, LUGARES, departamentoDe, departamentoOficial, lugarGuardado, municipioOficial, municipiosDe, textoLugar } from "@/lib/guatemala";

describe("departamentos y municipios de Guatemala", () => {
  test("están los 22 departamentos y ninguno repite municipios", () => {
    assert.equal(DEPARTAMENTOS.length, 22);
    for (const d of DEPARTAMENTOS) assert.equal(new Set(LUGARES[d]).size, LUGARES[d]!.length, `${d} repite un municipio`);
    assert.ok(Object.values(LUGARES).flat().length >= 335);
  });

  test("busca sin importar mayúsculas ni tildes y devuelve el nombre oficial", () => {
    assert.equal(departamentoOficial("PETEN"), "Petén");
    assert.equal(departamentoOficial("atlantida"), null);
    assert.equal(municipioOficial("izabal", "  morales "), "Morales");
    assert.equal(municipioOficial("Izabal", "Flores"), null); // Flores es de Petén
    assert.deepEqual(municipiosDe("Izabal"), ["Puerto Barrios", "Livingston", "El Estor", "Morales", "Los Amates"]);
    assert.deepEqual(municipiosDe("nada"), []);
  });

  test("el departamento de un municipio, solo si el nombre es único en el país", () => {
    assert.equal(departamentoDe("Morales"), "Izabal");
    assert.equal(departamentoDe("san jose"), null); // hay uno en Escuintla y otro en Petén
    assert.equal(departamentoDe("Santo Tomás de Castilla"), null); // es un puerto de Puerto Barrios, no un municipio
  });

  test("lo guardado vuelve a los selectores completo y coherente", () => {
    assert.deepEqual(lugarGuardado("izabal", "morales"), { departamento: "Izabal", municipio: "Morales" });
    assert.deepEqual(lugarGuardado(null, "Morales"), { departamento: "Izabal", municipio: "Morales" }); // dato viejo: solo el municipio
    assert.deepEqual(lugarGuardado("Petén", "Morales"), { departamento: "Petén", municipio: "" }); // no se corresponden
    assert.deepEqual(lugarGuardado(null, "Un pueblo inventado"), { departamento: "", municipio: "" });
  });

  test("el texto del lugar", () => {
    assert.equal(textoLugar("Morales", "Izabal"), "Morales, Izabal");
    assert.equal(textoLugar("Morales", null), "Morales");
    assert.equal(textoLugar(null, null), "");
  });
});
