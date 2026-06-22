// Référence globale de navigation — permet de naviguer hors composant (ex. tap
// sur une notification push). Branchée sur le NavigationContainer (AppNavigator).
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export default navigationRef;
