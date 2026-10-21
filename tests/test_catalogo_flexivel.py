import unittest
from unittest.mock import patch
from modules import ofertas

class CatalogoFlexivelTests(unittest.TestCase):
    def test_anteriores_saem_do_catalogo_so_quando_substituto_esta_pronto(self):
        lista=[{'id':i,'erros':[]} for i in ofertas.SUBSTITUIDOS]
        lista += [{'id':i,'erros':[]} for i in ofertas.SUBSTITUIDOS.values()]
        with patch.object(ofertas,'motor',return_value=lista):
            resultado=ofertas.catalogo()
        for t in resultado:
            self.assertEqual(t.get('substituidoPor'),ofertas.SUBSTITUIDOS.get(t['id']))
        self.assertNotIn('substituidoPor',lista[0])
        # Ausência/falha do substituto não esconde o único modelo utilizável.
        with patch.object(ofertas,'motor',return_value=[{'id':'uniforca-hora-da-feira','erros':[]},{'id':'uniforca-hora-da-feira-flexivel','erros':['quebrado']}]):
            self.assertNotIn('substituidoPor',ofertas.catalogo()[0])

if __name__=='__main__':unittest.main()
