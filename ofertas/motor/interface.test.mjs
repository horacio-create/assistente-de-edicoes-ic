// The existing Ofertas CI runs `node --test` from this directory.
// Register the UI contract tests here without changing the shared workflow.
import '../../tests/fluxo_ofertas.test.cjs';
import '../../tests/editor_integrado.test.cjs';
import '../../tests/miniaturas_cartelas.test.cjs';
import '../../tests/editor_navegacao.test.cjs';
import '../../tests/edicao_cartelas.test.cjs';
import '../../tests/lote_interface.test.cjs';
