import {EventEmitter, Injectable} from '@angular/core';
import {DataServiceService} from "./services/data-service.service";

@Injectable({
  providedIn: 'root'
})
export class ProductsService {

  products;
  types;
  productsUpdated = new EventEmitter();
  availableTimes;

  constructor(private dataService: DataServiceService) {
  }
  getAvailableTimesCount() {
    if(!this.availableTimes) { return 0; }
    return Object.keys(this.availableTimes).length;
  }

  setProducts(p, types) {
    this.types = types;
    this.products = p;
  }
  async loadAvailableTimes() {
    this.availableTimes = await this.dataService.getAvailableTimeSlots().toPromise();
  }
  getProducts() {
    const special = this.types.find(t => t.name === "Special");
    return this.products.filter(p => p.typeId !== special.id)
  }

  findMatchingProduct(p) {
    return this.products.find(product => product.id === p)
  }

  updateProductQuantity(itemId, increment) {
    const p = this.findMatchingProduct(itemId);

    if(p.quantity === -1){ return; }
    p.quantity -= increment;
    this.productsUpdated.emit(this.products);
  }
}