import assert from "node:assert/strict";
import { test } from "node:test";
import { avanceDePedido } from "../lib/pedidos/pasos";

test("un borrador no tiene línea de pasos", () => assert.equal(avanceDePedido("borrador", "recoger", []), null));

test("el cuarto paso depende de la entrega", () => {
  assert.equal(avanceDePedido("pagado", "envio", [])!.pasos[3], "Enviado");
  assert.equal(avanceDePedido("pagado", "recoger", [])!.pasos[3], "Listo para recoger");
});

test("cada estado cae en su paso", () => {
  const casos: [Parameters<typeof avanceDePedido>[0], number][] = [["pendiente_pago", 0], ["en_revision", 0], ["pagado", 1], ["preparando", 2], ["enviado", 3], ["listo_para_recoger", 3]];
  for (const [e, n] of casos) assert.equal(avanceDePedido(e, "envio", [])!.actual, n, e);
});

test("entregado deja todos los pasos cumplidos", () => {
  const a = avanceDePedido("entregado", "envio", [])!;
  assert.equal(a.actual, a.pasos.length);
  assert.equal(a.detenido, false);
});

test("cancelado o vencido se detiene en el último paso alcanzado", () => {
  assert.deepEqual(avanceDePedido("vencido", "envio", ["pendiente_pago"]), { pasos: avanceDePedido("vencido", "envio", [])!.pasos, actual: 0, detenido: true });
  assert.equal(avanceDePedido("cancelado", "envio", ["pendiente_pago", "en_revision", "pagado", "preparando"])!.actual, 2);
  assert.equal(avanceDePedido("cancelado", "envio", [])!.actual, 0);
});
