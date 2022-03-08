import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { OrderServiceService } from './order-service.service';
import { Observable } from 'rxjs';
import {StripeService} from "./stripe.service";

@Injectable({
  providedIn: 'root'
})
export class DataServiceService {

  constructor(private http: HttpClient,
              private stripeService: StripeService,
              private orderService: OrderServiceService) { }

  getProductTypes(): Observable<any> {
    return this.orderService.getProductTypes();
  }
  getFullMenu(): Observable<any> {
    return this.orderService.getFullMenu();
  }
  getActiveMenu(): Observable<any> {
    return this.orderService.getActiveMenu();
  }

  processPayment(data): Observable<any> {
    return this.stripeService.processPayment(data);
  }
}
